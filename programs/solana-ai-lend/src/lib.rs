use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("8SGxBGi7RuYas8r7rU4e6hxDLGo7Hw4f3nNytCqEu5AJ");

#[program]
pub mod solana_ai_lend {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitPool>, params: PoolParams) -> Result<()> {
        require!(params.min_interest_rate_bps <= params.max_interest_rate_bps, LendError::RateTooLow);
        require!(params.initial_interest_rate_bps >= params.min_interest_rate_bps, LendError::RateTooLow);
        require!(params.initial_interest_rate_bps <= params.max_interest_rate_bps, LendError::RateTooHigh);
        require!(params.min_collateral_ratio_bps <= params.max_collateral_ratio_bps, LendError::CollateralTooLow);
        require!(params.initial_collateral_ratio_bps >= params.min_collateral_ratio_bps, LendError::CollateralTooLow);
        require!(params.initial_collateral_ratio_bps <= params.max_collateral_ratio_bps, LendError::CollateralTooHigh);
        require!(params.liquidation_threshold_bps > 0, LendError::ZeroAmount);
        require!(params.max_borrow_limit > 0, LendError::ZeroAmount);
        require!(params.keeper_reward_bps <= 500, LendError::RewardTooHigh); // max 5%

        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;

        pool.authority = ctx.accounts.authority.key();
        pool.ai_agent = params.ai_agent;
        pool.token_mint = ctx.accounts.token_mint.key();

        pool.total_deposits = 0;
        pool.total_borrows = 0;
        pool.available_liquidity = 0;
        pool.total_collateral_sol = 0;

        pool.interest_rate_bps = params.initial_interest_rate_bps;
        pool.collateral_ratio_bps = params.initial_collateral_ratio_bps;
        pool.max_borrow_limit = params.max_borrow_limit;
        pool.liquidation_threshold_bps = params.liquidation_threshold_bps;

        pool.max_interest_rate_bps = params.max_interest_rate_bps;
        pool.min_interest_rate_bps = params.min_interest_rate_bps;
        pool.min_collateral_ratio_bps = params.min_collateral_ratio_bps;
        pool.max_collateral_ratio_bps = params.max_collateral_ratio_bps;

        pool.sol_price_usd = 0;

        pool.total_deposits_count = 0;
        pool.total_borrows_count = 0;
        pool.total_ai_updates = 0;
        pool.total_ai_skips = 0;
        pool.total_liquidations = 0;
        pool.current_mood = ProtocolMood::Calm;
        pool.is_frozen = false;
        pool.protocol_created_at = now;

        pool.last_update = now;
        pool.keeper_reward_bps = params.keeper_reward_bps;
        pool.update_cooldown = 600;
        // Step 23: Safety Net
        pool.danger_slots = 0;
        pool.auto_rate_active = false;
        pool.last_danger_check = now;
        // Step 25: Price tracking
        pool.price_last_updated = 0;

        // Step 35: Insurance Fund (10% of interest → reserve)
        pool.insurance_fund_bps = 1000; // 10%
        pool.insurance_balance = 0;
        pool.total_bad_debt_covered = 0;

        // Step 36: Withdrawal rate limit (0 = unlimited on devnet)
        pool.max_withdraw_per_epoch = 0;
        pool.withdrawn_this_epoch = 0;
        pool.current_epoch = 0;

        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.pool_vault;

        emit!(PoolInitializedEvent {
            pool: ctx.accounts.pool.key(),
            authority: ctx.accounts.authority.key(),
            ai_agent: params.ai_agent,
            token_mint: ctx.accounts.token_mint.key(),
            initial_rate_bps: params.initial_interest_rate_bps,
            initial_collateral_bps: params.initial_collateral_ratio_bps,
            timestamp: now,
        });

        Ok(())
    }

    /// Set SOL/USD price (authority or AI agent). Tracks staleness.
    pub fn set_sol_price(ctx: Context<SetSolPrice>, price_usd: u64) -> Result<()> {
        require!(price_usd > 0, LendError::InvalidPrice);
        let now = Clock::get()?.unix_timestamp;
        let pool = &mut ctx.accounts.pool;
        pool.sol_price_usd = price_usd;
        pool.price_last_updated = now;

        emit!(SolPriceUpdatedEvent {
            pool: pool.key(),
            price_usd,
            updater: ctx.accounts.signer.key(),
            timestamp: now,
        });

        Ok(())
    }

    /// AI agent updates pool parameters with guard rails.
    pub fn update_parameters(ctx: Context<UpdateParameters>, params: UpdateParams) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(!pool.is_frozen, LendError::ProtocolFrozen);
        let now = Clock::get()?.unix_timestamp;

        // Cooldown check
        let elapsed = now.checked_sub(pool.last_update).ok_or(LendError::MathOverflow)?;
        require!(elapsed >= pool.update_cooldown, LendError::CooldownActive);

        // Rate bounds
        require!(params.new_interest_rate_bps >= pool.min_interest_rate_bps, LendError::RateTooLow);
        require!(params.new_interest_rate_bps <= pool.max_interest_rate_bps, LendError::RateTooHigh);

        // Collateral bounds
        require!(params.new_collateral_ratio_bps >= pool.min_collateral_ratio_bps, LendError::CollateralTooLow);
        require!(params.new_collateral_ratio_bps <= pool.max_collateral_ratio_bps, LendError::CollateralTooHigh);

        // Max 20% change on rate
        let rate_diff = if params.new_interest_rate_bps > pool.interest_rate_bps {
            params.new_interest_rate_bps - pool.interest_rate_bps
        } else {
            pool.interest_rate_bps - params.new_interest_rate_bps
        };
        let max_rate_change = pool.interest_rate_bps.max(1) / 5; // 20%, min 1 to avoid div-by-zero
        require!(rate_diff <= max_rate_change, LendError::ChangeTooLarge);

        // Max 20% change on collateral ratio
        let col_diff = if params.new_collateral_ratio_bps > pool.collateral_ratio_bps {
            params.new_collateral_ratio_bps - pool.collateral_ratio_bps
        } else {
            pool.collateral_ratio_bps - params.new_collateral_ratio_bps
        };
        let max_col_change = pool.collateral_ratio_bps.max(1) / 5;
        require!(col_diff <= max_col_change, LendError::ChangeTooLarge);

        // Reasoning length
        require!(params.reasoning_short.len() <= 256, LendError::ReasoningTooLong);

        // Save old values for log
        let old_rate = pool.interest_rate_bps;
        let old_collateral = pool.collateral_ratio_bps;
        let old_max_borrow = pool.max_borrow_limit;
        let update_number = pool.total_ai_updates;

        // Update pool
        let pool = &mut ctx.accounts.pool;
        pool.interest_rate_bps = params.new_interest_rate_bps;
        pool.collateral_ratio_bps = params.new_collateral_ratio_bps;
        pool.max_borrow_limit = params.new_max_borrow_limit;
        pool.last_update = now;
        pool.total_ai_updates = pool.total_ai_updates.checked_add(1).ok_or(LendError::MathOverflow)?;

        // Update mood based on risk level
        pool.current_mood = match params.risk_level {
            RiskLevel::Low => ProtocolMood::Thriving,
            RiskLevel::Medium => ProtocolMood::Cautious,
            RiskLevel::High => ProtocolMood::Defensive,
            RiskLevel::Critical => ProtocolMood::Emergency,
        };

        // Write decision log
        let log = &mut ctx.accounts.decision_log;
        log.pool = pool.key();
        log.update_number = update_number;
        log.timestamp = now;
        log.old_interest_rate = old_rate;
        log.new_interest_rate = params.new_interest_rate_bps;
        log.old_collateral_ratio = old_collateral;
        log.new_collateral_ratio = params.new_collateral_ratio_bps;
        log.old_max_borrow = old_max_borrow;
        log.new_max_borrow = params.new_max_borrow_limit;
        log.reasoning_hash = params.reasoning_hash;
        log.reasoning_short = params.reasoning_short.clone();
        log.confidence = params.confidence;
        log.risk_level = params.risk_level;
        log.bump = ctx.bumps.decision_log;

        emit!(ParametersUpdatedEvent {
            pool: pool.key(),
            ai_agent: ctx.accounts.ai_agent.key(),
            old_rate,
            new_rate: params.new_interest_rate_bps,
            old_collateral,
            new_collateral: params.new_collateral_ratio_bps,
            reasoning_short: params.reasoning_short,
            risk_level: params.risk_level,
            confidence: params.confidence,
            mood: pool.current_mood,
            update_number,
            timestamp: now,
        });

        Ok(())
    }

    /// AI emergency freeze — AI agent can freeze if anomaly detected.
    pub fn ai_emergency_freeze(ctx: Context<AiEmergencyFreeze>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.is_frozen = true;
        pool.current_mood = ProtocolMood::Emergency;

        let now = Clock::get()?.unix_timestamp;
        emit!(EmergencyFreezeEvent {
            pool: pool.key(),
            authority: ctx.accounts.ai_agent.key(),
            timestamp: now,
        });

        Ok(())
    }

    /// Emergency freeze — authority only. Blocks deposit, borrow, deposit_collateral.
    pub fn emergency_freeze(ctx: Context<EmergencyFreeze>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.is_frozen = true;

        let now = Clock::get()?.unix_timestamp;
        emit!(EmergencyFreezeEvent {
            pool: pool.key(),
            authority: ctx.accounts.authority.key(),
            timestamp: now,
        });

        Ok(())
    }

    /// Migrate pool account to new layout (adds keeper_reward_bps field).
    /// Authority only, idempotent.
    pub fn migrate_pool(ctx: Context<MigratePool>, keeper_reward_bps: u16, pool_bump: u8, vault_bump: u8) -> Result<()> {
        require!(keeper_reward_bps <= 500, LendError::RewardTooHigh);

        // Verify authority matches pool.authority (first pubkey after 8-byte discriminator)
        let pool_info = &ctx.accounts.pool;
        {
            let data = pool_info.try_borrow_data()?;
            let stored_authority = Pubkey::try_from(&data[8..40]).map_err(|_| LendError::Unauthorized)?;
            require!(stored_authority == ctx.accounts.authority.key(), LendError::Unauthorized);
        }
        let new_size = 8 + LendingPool::INIT_SPACE;
        let old_size = pool_info.data_len();

        if old_size < new_size {
            let rent = Rent::get()?;
            let new_min = rent.minimum_balance(new_size);
            let current_lamports = pool_info.lamports();
            if current_lamports < new_min {
                let diff = new_min - current_lamports;
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.authority.to_account_info(),
                            to: pool_info.to_account_info(),
                        },
                    ),
                    diff,
                )?;
            }
            pool_info.realloc(new_size, false)?;
        }

        // Adaptive migration: detect current layout by account size and shift fields.
        // bump and vault_bump are always the last 2 bytes before padding.
        let mut data = pool_info.try_borrow_mut_data()?;

        // Use provided bumps (caller derives them from PDA)
        let bump = pool_bump;
        let vault_bump = vault_bump;

        // Preserve key fields from known positions
        if old_size == 234 {
            // V1→V3: Original layout, no keeper_reward_bps, no step23 fields
            // Shift last_update(216..224) → 218, insert keeper_reward(216)
            let last_update: [u8; 8] = data[216..224].try_into().unwrap();
            let cooldown: [u8; 8] = data[224..232].try_into().unwrap();
            // Write from end to avoid overlap
            data[218..226].copy_from_slice(&last_update);
            data[226..234].copy_from_slice(&cooldown);
            data[216..218].copy_from_slice(&keeper_reward_bps.to_le_bytes());
        } else if old_size == 236 {
            // V2→V3: Has keeper_reward_bps at 216, no step23 fields
            // Fields 216-235 are already correct, just need to set keeper_reward
            data[216..218].copy_from_slice(&keeper_reward_bps.to_le_bytes());
        }
        // Zero out everything from old bump positions to new end, then write bump/vault_bump at new end.
        if old_size < new_size {
            let clear_start = old_size.saturating_sub(2);
            for i in clear_start..new_size {
                data[i] = 0;
            }
        }

        // Always ensure Step 35/36 fields are initialized correctly.
        // insurance_fund_bps (u16) is right after price_last_updated (i64).
        // Borsh layout: price_last_updated ends, then insurance_fund_bps (2), insurance_balance (8),
        // total_bad_debt_covered (8), max_withdraw_per_epoch (8), withdrawn_this_epoch (8),
        // current_epoch (8), bump (1), vault_bump (1) = total new section = 44 bytes
        // If insurance_fund_bps == 0 or looks corrupted (>1000), set to default 1000 (10%)
        let ins_offset = new_size - 2 - 8 - 8 - 8 - 8 - 8 - 2; // offset of insurance_fund_bps
        let current_ins = u16::from_le_bytes([data[ins_offset], data[ins_offset + 1]]);
        if current_ins == 0 || current_ins > 5000 {
            data[ins_offset..ins_offset + 2].copy_from_slice(&1000u16.to_le_bytes()); // 10%
        }

        let new_end = new_size;
        data[new_end - 2] = bump;
        data[new_end - 1] = vault_bump;

        Ok(())
    }

    /// Unfreeze protocol — authority only.
    pub fn emergency_unfreeze(ctx: Context<EmergencyFreeze>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.is_frozen = false;

        let now = Clock::get()?.unix_timestamp;
        emit!(EmergencyUnfreezeEvent {
            pool: pool.key(),
            authority: ctx.accounts.authority.key(),
            timestamp: now,
        });

        Ok(())
    }

    /// Fix corrupted last_update timestamp (authority only, one-time migration fix)
    pub fn fix_pool_timestamp(ctx: Context<EmergencyFreeze>, new_cooldown: Option<i64>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        if let Some(cd) = new_cooldown {
            pool.update_cooldown = cd.max(30); // min 30 sec
        }
        let now = Clock::get()?.unix_timestamp;
        pool.last_update = now - pool.update_cooldown - 1;
        Ok(())
    }

    /// Step 35: Cover bad debt from insurance fund (authority only)
    pub fn cover_bad_debt(ctx: Context<EmergencyFreeze>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);
        let pool = &mut ctx.accounts.pool;
        require!(amount <= pool.insurance_balance, LendError::InsufficientInsurance);

        pool.insurance_balance = pool.insurance_balance.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        pool.total_bad_debt_covered = pool.total_bad_debt_covered.saturating_add(amount);
        pool.total_borrows = pool.total_borrows.saturating_sub(amount);

        emit!(BadDebtCoveredEvent {
            pool: pool.key(),
            amount,
            remaining_insurance: pool.insurance_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // Step 33: Initialize guardrail config PDA
    pub fn init_guardrails(ctx: Context<InitGuardrails>, params: GuardrailParams) -> Result<()> {
        let config = &mut ctx.accounts.guardrail_config;
        let now = Clock::get()?.unix_timestamp;
        config.pool = ctx.accounts.pool.key();
        config.authority = ctx.accounts.authority.key();
        config.min_rate_bps = params.min_rate_bps;
        config.max_rate_bps = params.max_rate_bps;
        config.min_collateral_bps = params.min_collateral_bps;
        config.max_collateral_bps = params.max_collateral_bps;
        config.max_change_bps = params.max_change_bps;
        config.cooldown_seconds = params.cooldown_seconds;
        // Simple hash: XOR all params into 32 bytes
        let mut hash = [0u8; 32];
        hash[0..2].copy_from_slice(&params.min_rate_bps.to_le_bytes());
        hash[2..4].copy_from_slice(&params.max_rate_bps.to_le_bytes());
        hash[4..6].copy_from_slice(&params.min_collateral_bps.to_le_bytes());
        hash[6..8].copy_from_slice(&params.max_collateral_bps.to_le_bytes());
        hash[8..10].copy_from_slice(&params.max_change_bps.to_le_bytes());
        hash[10..18].copy_from_slice(&params.cooldown_seconds.to_le_bytes());
        config.config_hash = hash;
        config.last_updated = now;
        config.bump = ctx.bumps.guardrail_config;

        emit!(GuardrailsUpdatedEvent {
            pool: ctx.accounts.pool.key(),
            config_hash: hash,
            timestamp: now,
        });
        Ok(())
    }

    // Step 33: Update guardrail config (authority only)
    pub fn update_guardrails(ctx: Context<UpdateGuardrails>, params: GuardrailParams) -> Result<()> {
        let config = &mut ctx.accounts.guardrail_config;
        let now = Clock::get()?.unix_timestamp;
        config.min_rate_bps = params.min_rate_bps;
        config.max_rate_bps = params.max_rate_bps;
        config.min_collateral_bps = params.min_collateral_bps;
        config.max_collateral_bps = params.max_collateral_bps;
        config.max_change_bps = params.max_change_bps;
        config.cooldown_seconds = params.cooldown_seconds;
        let mut hash = [0u8; 32];
        hash[0..2].copy_from_slice(&params.min_rate_bps.to_le_bytes());
        hash[2..4].copy_from_slice(&params.max_rate_bps.to_le_bytes());
        hash[4..6].copy_from_slice(&params.min_collateral_bps.to_le_bytes());
        hash[6..8].copy_from_slice(&params.max_collateral_bps.to_le_bytes());
        hash[8..10].copy_from_slice(&params.max_change_bps.to_le_bytes());
        hash[10..18].copy_from_slice(&params.cooldown_seconds.to_le_bytes());
        config.config_hash = hash;
        config.last_updated = now;

        emit!(GuardrailsUpdatedEvent {
            pool: ctx.accounts.pool.key(),
            config_hash: hash,
            timestamp: now,
        });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);
        require!(!ctx.accounts.pool.is_frozen, LendError::ProtocolFrozen);

        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.user_position;
        let now = Clock::get()?.unix_timestamp;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        pool.total_deposits = pool.total_deposits.checked_add(amount).ok_or(LendError::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_add(amount).ok_or(LendError::MathOverflow)?;
        pool.total_deposits_count = pool.total_deposits_count.checked_add(1).ok_or(LendError::MathOverflow)?;

        if position.owner == Pubkey::default() {
            position.owner = ctx.accounts.owner.key();
            position.pool = pool.key();
            position.first_deposit_at = now;
            position.loyalty_tier = LoyaltyTier::Bronze;
            position.bump = ctx.bumps.user_position;
        }
        position.deposited = position.deposited.checked_add(amount).ok_or(LendError::MathOverflow)?;
        position.last_interest_update = now;
        position.total_operations = position.total_operations.checked_add(1).ok_or(LendError::MathOverflow)?;

        emit!(DepositEvent {
            pool: pool.key(),
            user: ctx.accounts.owner.key(),
            amount,
            total_deposited: position.deposited,
            pool_total_deposits: pool.total_deposits,
            timestamp: now,
        });

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);

        let position = &ctx.accounts.user_position;
        require!(amount <= position.deposited, LendError::InsufficientDeposit);

        // Read values before mutable borrow
        let available = ctx.accounts.pool.available_liquidity;
        let authority_key = ctx.accounts.pool.authority;
        let bump = ctx.accounts.pool.bump;
        let max_withdraw = ctx.accounts.pool.max_withdraw_per_epoch;
        require!(amount <= available, LendError::InsufficientLiquidity);

        // Step 36: Withdrawal rate limit per epoch
        if max_withdraw > 0 {
            let clock = Clock::get()?;
            let pool = &mut ctx.accounts.pool;
            if clock.epoch != pool.current_epoch {
                pool.current_epoch = clock.epoch;
                pool.withdrawn_this_epoch = 0;
            }
            let new_total = pool.withdrawn_this_epoch.checked_add(amount).ok_or(LendError::MathOverflow)?;
            require!(new_total <= pool.max_withdraw_per_epoch, LendError::WithdrawalLimitExceeded);
            pool.withdrawn_this_epoch = new_total;
        }

        let seeds = &[
            b"lending_pool".as_ref(),
            authority_key.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;
        pool.total_deposits = pool.total_deposits.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_sub(amount).ok_or(LendError::MathOverflow)?;

        let position = &mut ctx.accounts.user_position;
        position.deposited = position.deposited.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        position.total_operations = position.total_operations.checked_add(1).ok_or(LendError::MathOverflow)?;

        emit!(WithdrawEvent {
            pool: pool.key(),
            user: ctx.accounts.owner.key(),
            amount,
            remaining_deposit: position.deposited,
            pool_available_liquidity: pool.available_liquidity,
            timestamp: now,
        });

        Ok(())
    }

    /// Deposit SOL as collateral.
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);
        require!(!ctx.accounts.pool.is_frozen, LendError::ProtocolFrozen);

        // Transfer SOL: user → pool PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            amount,
        )?;

        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.user_position;
        let now = Clock::get()?.unix_timestamp;

        if position.owner == Pubkey::default() {
            position.owner = ctx.accounts.owner.key();
            position.pool = pool.key();
            position.first_deposit_at = now;
            position.loyalty_tier = LoyaltyTier::Bronze;
            position.bump = ctx.bumps.user_position;
        }

        pool.total_collateral_sol = pool.total_collateral_sol.checked_add(amount).ok_or(LendError::MathOverflow)?;
        position.collateral_sol = position.collateral_sol.checked_add(amount).ok_or(LendError::MathOverflow)?;
        position.total_operations = position.total_operations.checked_add(1).ok_or(LendError::MathOverflow)?;

        emit!(CollateralDepositedEvent {
            pool: pool.key(),
            user: ctx.accounts.owner.key(),
            amount,
            total_collateral: position.collateral_sol,
            timestamp: now,
        });

        Ok(())
    }

    /// Withdraw SOL collateral (only if no active borrow).
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);

        let position = &ctx.accounts.user_position;
        require!(position.borrowed == 0 && position.accrued_interest == 0, LendError::HasActiveBorrow);
        require!(amount <= position.collateral_sol, LendError::InsufficientCollateral);

        // Ensure pool keeps rent exemption
        let pool_info = ctx.accounts.pool.to_account_info();
        let rent = Rent::get()?;
        let min_lamports = rent.minimum_balance(pool_info.data_len());
        let pool_lamports = pool_info.lamports();
        require!(
            pool_lamports.checked_sub(amount).ok_or(LendError::MathOverflow)? >= min_lamports,
            LendError::InsufficientLiquidity
        );

        // Transfer SOL: pool PDA → user (direct lamport manipulation, our program owns pool)
        let new_pool = pool_lamports.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        **pool_info.try_borrow_mut_lamports()? = new_pool;

        let owner_info = ctx.accounts.owner.to_account_info();
        let new_owner = owner_info.lamports().checked_add(amount).ok_or(LendError::MathOverflow)?;
        **owner_info.try_borrow_mut_lamports()? = new_owner;

        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;
        pool.total_collateral_sol = pool.total_collateral_sol.checked_sub(amount).ok_or(LendError::MathOverflow)?;

        let position = &mut ctx.accounts.user_position;
        position.collateral_sol = position.collateral_sol.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        position.total_operations = position.total_operations.checked_add(1).ok_or(LendError::MathOverflow)?;

        emit!(CollateralWithdrawnEvent {
            pool: pool.key(),
            user: ctx.accounts.owner.key(),
            amount,
            remaining_collateral: position.collateral_sol,
            timestamp: now,
        });

        Ok(())
    }

    /// Borrow aiUSDC against SOL collateral.
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);
        require!(!ctx.accounts.pool.is_frozen, LendError::ProtocolFrozen);

        let pool = &ctx.accounts.pool;
        let position = &ctx.accounts.user_position;

        require!(pool.sol_price_usd > 0, LendError::InvalidPrice);

        let new_borrowed = position.borrowed.checked_add(amount).ok_or(LendError::MathOverflow)?;
        require!(new_borrowed <= pool.max_borrow_limit, LendError::BorrowLimitExceeded);
        require!(amount <= pool.available_liquidity, LendError::InsufficientLiquidity);

        // Collateral check with loyalty discount (Step 39)
        // collateral_value_usd = collateral_sol * sol_price / 1e9
        // Required: collateral_value >= new_borrowed * adjusted_ratio / 10000
        let loyalty_discount: u16 = match position.loyalty_tier {
            LoyaltyTier::Bronze   => 0,
            LoyaltyTier::Silver   => 500,   // -5%
            LoyaltyTier::Gold     => 1000,  // -10%
            LoyaltyTier::Platinum => 1500,  // -15%
        };
        let adjusted_ratio = pool.collateral_ratio_bps
            .saturating_sub(loyalty_discount)
            .max(pool.min_collateral_ratio_bps);

        let collateral_value = (position.collateral_sol as u128)
            .checked_mul(pool.sol_price_usd as u128).ok_or(LendError::MathOverflow)?
            .checked_div(1_000_000_000).ok_or(LendError::MathOverflow)?;

        let required = (new_borrowed as u128)
            .checked_mul(adjusted_ratio as u128).ok_or(LendError::MathOverflow)?
            .checked_div(10000).ok_or(LendError::MathOverflow)?;

        require!(collateral_value >= required, LendError::InsufficientCollateral);

        // Transfer aiUSDC: vault → user (PDA signer)
        let authority_key = pool.authority.key();
        let seeds = &[
            b"lending_pool".as_ref(),
            authority_key.as_ref(),
            &[pool.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;
        pool.total_borrows = pool.total_borrows.checked_add(amount).ok_or(LendError::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        pool.total_borrows_count = pool.total_borrows_count.checked_add(1).ok_or(LendError::MathOverflow)?;

        let position = &mut ctx.accounts.user_position;
        position.borrowed = new_borrowed;
        position.borrow_timestamp = now;
        position.last_interest_update = now;
        position.total_operations = position.total_operations.checked_add(1).ok_or(LendError::MathOverflow)?;

        emit!(BorrowEvent {
            pool: pool.key(),
            user: ctx.accounts.owner.key(),
            amount,
            total_borrowed: position.borrowed,
            collateral_sol: position.collateral_sol,
            timestamp: now,
        });

        // Step 23: Safety Net — check danger after borrow (increases utilization)
        check_and_update_danger(pool, now)?;

        Ok(())
    }

    /// Repay borrowed aiUSDC. Interest is paid first, then principal.
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);

        let position = &ctx.accounts.user_position;
        let total_owed = position.borrowed
            .checked_add(position.accrued_interest).ok_or(LendError::MathOverflow)?;
        require!(amount <= total_owed, LendError::RepayExceedsBorrow);

        // Transfer aiUSDC: user → vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.user_position;
        let now = Clock::get()?.unix_timestamp;

        // Pay interest first, then principal
        let mut remaining = amount;
        if remaining >= position.accrued_interest {
            remaining = remaining.checked_sub(position.accrued_interest).ok_or(LendError::MathOverflow)?;
            position.accrued_interest = 0;
        } else {
            position.accrued_interest = position.accrued_interest
                .checked_sub(remaining).ok_or(LendError::MathOverflow)?;
            remaining = 0;
        }

        // Step 35: Insurance accrual — take % of interest paid
        let interest_paid = amount.saturating_sub(remaining); // portion that went to interest
        if interest_paid > 0 && pool.insurance_fund_bps > 0 {
            let insurance_cut = interest_paid
                .checked_mul(pool.insurance_fund_bps as u64).ok_or(LendError::MathOverflow)?
                .checked_div(10000).ok_or(LendError::MathOverflow)?;
            pool.insurance_balance = pool.insurance_balance.saturating_add(insurance_cut);
        }

        if remaining > 0 {
            position.borrowed = position.borrowed.checked_sub(remaining).ok_or(LendError::MathOverflow)?;
            pool.total_borrows = pool.total_borrows.checked_sub(remaining).ok_or(LendError::MathOverflow)?;
        }

        pool.available_liquidity = pool.available_liquidity.checked_add(amount).ok_or(LendError::MathOverflow)?;
        position.total_operations = position.total_operations.checked_add(1).ok_or(LendError::MathOverflow)?;

        if position.borrowed == 0 && position.accrued_interest == 0 {
            position.borrow_timestamp = 0;
        }

        emit!(RepayEvent {
            pool: pool.key(),
            user: ctx.accounts.owner.key(),
            amount,
            remaining_borrow: position.borrowed,
            remaining_interest: position.accrued_interest,
            timestamp: now,
        });

        // Step 23: Safety Net — check danger after repay (decreases utilization, may reset)
        check_and_update_danger(pool, now)?;

        Ok(())
    }

    /// Accrue interest on a borrow position. Anyone can call this.
    pub fn accrue_interest(ctx: Context<AccrueInterest>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let position = &mut ctx.accounts.user_position;

        require!(position.borrowed > 0, LendError::NoBorrowToAccrue);

        let now = Clock::get()?.unix_timestamp;
        let elapsed = (now.checked_sub(position.last_interest_update)
            .ok_or(LendError::MathOverflow)?) as u64;

        if elapsed == 0 {
            return Ok(());
        }

        // interest = borrowed * rate_bps * elapsed_sec / (SECONDS_PER_YEAR * 10000)
        let interest = (position.borrowed as u128)
            .checked_mul(pool.interest_rate_bps as u128).ok_or(LendError::MathOverflow)?
            .checked_mul(elapsed as u128).ok_or(LendError::MathOverflow)?
            .checked_div(31_557_600u128.checked_mul(10000).ok_or(LendError::MathOverflow)?)
            .ok_or(LendError::MathOverflow)? as u64;

        position.accrued_interest = position.accrued_interest
            .checked_add(interest).ok_or(LendError::MathOverflow)?;
        position.last_interest_update = now;

        Ok(())
    }

    /// Partial liquidation: repay up to max_repay_amount of debt, seize proportional collateral + 5% bonus.
    /// Keeper (liquidator) receives keeper_reward_bps of repaid amount as incentive.
    pub fn liquidate(ctx: Context<Liquidate>, max_repay_amount: u64) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let position = &ctx.accounts.borrower_position;

        require!(pool.sol_price_usd > 0, LendError::InvalidPrice);
        require!(position.borrowed > 0, LendError::NothingToLiquidate);
        require!(max_repay_amount > 0, LendError::ZeroAmount);

        // Health factor = (collateral_usd * 10000) / (total_owed * liquidation_threshold)
        let collateral_value = (position.collateral_sol as u128)
            .checked_mul(pool.sol_price_usd as u128).ok_or(LendError::MathOverflow)?
            .checked_div(1_000_000_000).ok_or(LendError::MathOverflow)?;

        let total_owed = position.borrowed
            .checked_add(position.accrued_interest).ok_or(LendError::MathOverflow)?;

        let threshold = (total_owed as u128)
            .checked_mul(pool.liquidation_threshold_bps as u128).ok_or(LendError::MathOverflow)?
            .checked_div(10000).ok_or(LendError::MathOverflow)?;

        // health_factor < 10000 means undercollateralized (10000 = 1.0)
        let health_before = if total_owed == 0 {
            u64::MAX
        } else {
            (collateral_value
                .checked_mul(10000).ok_or(LendError::MathOverflow)?
                .checked_div(threshold).ok_or(LendError::MathOverflow)?) as u64
        };
        require!(health_before < 10000, LendError::PositionHealthy);

        // Partial: repay min(max_repay_amount, total_owed)
        let repay_amount = max_repay_amount.min(total_owed);

        // Collateral to seize: proportional to debt repaid + 5% liquidation bonus
        // seize_usd = repay_amount * 10500 / 10000
        let seize_usd = (repay_amount as u128)
            .checked_mul(10500).ok_or(LendError::MathOverflow)?
            .checked_div(10000).ok_or(LendError::MathOverflow)?;

        // Convert USD to SOL lamports: seize_sol = seize_usd * 1e9 / sol_price_usd
        let seize_sol = seize_usd
            .checked_mul(1_000_000_000).ok_or(LendError::MathOverflow)?
            .checked_div(pool.sol_price_usd as u128).ok_or(LendError::MathOverflow)? as u64;

        // Cap at borrower's actual collateral
        let seize_sol = seize_sol.min(position.collateral_sol);

        // Keeper reward: portion of repaid amount
        let keeper_reward = (repay_amount as u128)
            .checked_mul(pool.keeper_reward_bps as u128).ok_or(LendError::MathOverflow)?
            .checked_div(10000).ok_or(LendError::MathOverflow)? as u64;

        // Liquidator pays repay_amount in aiUSDC to pool vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.liquidator_token_account.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.liquidator.to_account_info(),
                },
            ),
            repay_amount,
        )?;

        // Transfer seized collateral SOL to liquidator
        let pool_info = ctx.accounts.pool.to_account_info();
        let rent = Rent::get()?;
        let min_lamports = rent.minimum_balance(pool_info.data_len());
        let available_sol = pool_info.lamports().checked_sub(min_lamports).ok_or(LendError::MathOverflow)?;
        let sol_to_liquidator = seize_sol.min(available_sol);

        let new_pool_lamports = pool_info.lamports()
            .checked_sub(sol_to_liquidator).ok_or(LendError::MathOverflow)?;
        **pool_info.try_borrow_mut_lamports()? = new_pool_lamports;

        let liquidator_info = ctx.accounts.liquidator.to_account_info();
        let new_liq_lamports = liquidator_info.lamports()
            .checked_add(sol_to_liquidator).ok_or(LendError::MathOverflow)?;
        **liquidator_info.try_borrow_mut_lamports()? = new_liq_lamports;

        // Update borrower position (partial — may have remaining debt)
        let position = &mut ctx.accounts.borrower_position;
        let borrower_key = position.owner;

        // Pay interest first, then principal
        let mut remaining = repay_amount;
        if remaining >= position.accrued_interest {
            remaining = remaining.checked_sub(position.accrued_interest).ok_or(LendError::MathOverflow)?;
            position.accrued_interest = 0;
        } else {
            position.accrued_interest = position.accrued_interest
                .checked_sub(remaining).ok_or(LendError::MathOverflow)?;
            remaining = 0;
        }
        if remaining > 0 {
            position.borrowed = position.borrowed.checked_sub(remaining).ok_or(LendError::MathOverflow)?;
        }
        position.collateral_sol = position.collateral_sol.checked_sub(seize_sol).ok_or(LendError::MathOverflow)?;

        // If fully repaid, clear timestamps
        if position.borrowed == 0 && position.accrued_interest == 0 {
            position.borrow_timestamp = 0;
        }

        // Update pool state
        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;
        pool.total_borrows = pool.total_borrows.saturating_sub(remaining);
        pool.available_liquidity = pool.available_liquidity.checked_add(repay_amount).ok_or(LendError::MathOverflow)?;
        pool.total_collateral_sol = pool.total_collateral_sol.saturating_sub(seize_sol);
        pool.total_liquidations = pool.total_liquidations.checked_add(1).ok_or(LendError::MathOverflow)?;

        // Calculate health after
        let new_total_owed = position.borrowed
            .checked_add(position.accrued_interest).ok_or(LendError::MathOverflow)?;
        let health_after = if new_total_owed == 0 {
            u64::MAX
        } else {
            let new_col = (position.collateral_sol as u128)
                .checked_mul(pool.sol_price_usd as u128).ok_or(LendError::MathOverflow)?
                .checked_div(1_000_000_000).ok_or(LendError::MathOverflow)?;
            let new_thresh = (new_total_owed as u128)
                .checked_mul(pool.liquidation_threshold_bps as u128).ok_or(LendError::MathOverflow)?
                .checked_div(10000).ok_or(LendError::MathOverflow)?;
            if new_thresh == 0 { u64::MAX } else {
                (new_col.checked_mul(10000).ok_or(LendError::MathOverflow)?
                    .checked_div(new_thresh).ok_or(LendError::MathOverflow)?) as u64
            }
        };

        emit!(LiquidationEvent {
            pool: pool.key(),
            liquidator: ctx.accounts.liquidator.key(),
            borrower: borrower_key,
            repaid_amount: repay_amount,
            collateral_seized: sol_to_liquidator,
            keeper_reward,
            health_factor_before: health_before,
            health_factor_after: health_after,
            timestamp: now,
        });

        Ok(())
    }

    /// View-like instruction: compute health factor for a position (does NOT modify state).
    pub fn get_health_factor(ctx: Context<GetHealthFactor>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let position = &ctx.accounts.user_position;

        let total_owed = position.borrowed
            .checked_add(position.accrued_interest).ok_or(LendError::MathOverflow)?;

        let health_factor = if total_owed == 0 || pool.sol_price_usd == 0 {
            u64::MAX
        } else {
            let collateral_usd = (position.collateral_sol as u128)
                .checked_mul(pool.sol_price_usd as u128).ok_or(LendError::MathOverflow)?
                .checked_div(1_000_000_000).ok_or(LendError::MathOverflow)?;
            let threshold = (total_owed as u128)
                .checked_mul(pool.liquidation_threshold_bps as u128).ok_or(LendError::MathOverflow)?
                .checked_div(10000).ok_or(LendError::MathOverflow)?;
            if threshold == 0 { u64::MAX } else {
                (collateral_usd.checked_mul(10000).ok_or(LendError::MathOverflow)?
                    .checked_div(threshold).ok_or(LendError::MathOverflow)?) as u64
            }
        };

        emit!(HealthFactorEvent {
            pool: pool.key(),
            user: position.owner,
            health_factor,
            collateral_sol: position.collateral_sol,
            borrowed: position.borrowed,
            accrued_interest: position.accrued_interest,
            sol_price_usd: pool.sol_price_usd,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ============================================================
// Step 23: Safety Net helper
// ============================================================

fn check_and_update_danger(pool: &mut LendingPool, now: i64) -> Result<()> {
    if pool.total_deposits == 0 {
        return Ok(());
    }
    // Utilization in bps: borrows * 10000 / deposits
    let util_bps = (pool.total_borrows as u128)
        .checked_mul(10000).ok_or(LendError::MathOverflow)?
        .checked_div(pool.total_deposits as u128).ok_or(LendError::MathOverflow)? as u64;

    if util_bps > 8500 {
        // > 85% utilization — danger zone
        pool.danger_slots = pool.danger_slots.saturating_add(1);

        if pool.danger_slots > 100 {
            // Auto-raise rate by 0.5% (50 bps)
            let new_rate = pool.interest_rate_bps.saturating_add(50);
            if new_rate <= pool.max_interest_rate_bps {
                pool.interest_rate_bps = new_rate;
                pool.auto_rate_active = true;
            }
            pool.danger_slots = 0; // reset after raise
        }
    } else {
        // Safe zone — reset
        if pool.danger_slots > 0 {
            pool.danger_slots = 0;
            pool.auto_rate_active = false;
        }
    }
    pool.last_danger_check = now;
    Ok(())
}

// ============================================================
// PARAMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct GuardrailParams {
    pub min_rate_bps: u16,
    pub max_rate_bps: u16,
    pub min_collateral_bps: u16,
    pub max_collateral_bps: u16,
    pub max_change_bps: u16,
    pub cooldown_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateParams {
    pub new_interest_rate_bps: u16,
    pub new_collateral_ratio_bps: u16,
    pub new_max_borrow_limit: u64,
    pub reasoning_hash: [u8; 32],
    pub reasoning_short: String,
    pub confidence: u8,
    pub risk_level: RiskLevel,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PoolParams {
    pub ai_agent: Pubkey,
    pub initial_interest_rate_bps: u16,
    pub initial_collateral_ratio_bps: u16,
    pub max_borrow_limit: u64,
    pub liquidation_threshold_bps: u16,
    pub max_interest_rate_bps: u16,
    pub min_interest_rate_bps: u16,
    pub min_collateral_ratio_bps: u16,
    pub max_collateral_ratio_bps: u16,
    pub keeper_reward_bps: u16,
}

// ============================================================
// STATE ACCOUNTS
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct LendingPool {
    pub authority: Pubkey,
    pub ai_agent: Pubkey,
    pub token_mint: Pubkey,

    pub total_deposits: u64,
    pub total_borrows: u64,
    pub available_liquidity: u64,
    pub total_collateral_sol: u64,

    pub interest_rate_bps: u16,
    pub collateral_ratio_bps: u16,
    pub max_borrow_limit: u64,
    pub liquidation_threshold_bps: u16,

    pub max_interest_rate_bps: u16,
    pub min_interest_rate_bps: u16,
    pub min_collateral_ratio_bps: u16,
    pub max_collateral_ratio_bps: u16,

    /// SOL/USD price with 6 decimals (e.g. 185_500_000 = $185.50)
    pub sol_price_usd: u64,

    pub total_deposits_count: u64,
    pub total_borrows_count: u64,
    pub total_ai_updates: u64,
    pub total_ai_skips: u64,
    pub total_liquidations: u64,
    pub current_mood: ProtocolMood,
    pub is_frozen: bool,
    pub protocol_created_at: i64,

    pub keeper_reward_bps: u16,

    pub last_update: i64,
    pub update_cooldown: i64,

    // Step 23: Safety Net
    pub danger_slots: u64,
    pub auto_rate_active: bool,
    pub last_danger_check: i64,
    // Step 25: Price source tracking
    pub price_last_updated: i64,

    // Step 35: Insurance Fund
    pub insurance_fund_bps: u16,       // % of interest → insurance (e.g. 1000 = 10%)
    pub insurance_balance: u64,        // accumulated insurance reserve
    pub total_bad_debt_covered: u64,   // lifetime bad debt covered

    // Step 36: Withdrawal rate limit
    pub max_withdraw_per_epoch: u64,   // max withdrawal per epoch (0 = unlimited)
    pub withdrawn_this_epoch: u64,
    pub current_epoch: u64,

    pub bump: u8,
    pub vault_bump: u8,
}

// Step 33: Guardrail Config — separate PDA
#[account]
#[derive(InitSpace)]
pub struct GuardrailConfig {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub min_rate_bps: u16,
    pub max_rate_bps: u16,
    pub min_collateral_bps: u16,
    pub max_collateral_bps: u16,
    pub max_change_bps: u16,
    pub cooldown_seconds: i64,
    pub config_hash: [u8; 32],
    pub last_updated: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub deposited: u64,
    pub borrowed: u64,
    pub collateral_sol: u64,
    pub borrow_timestamp: i64,
    pub last_interest_update: i64,
    pub accrued_interest: u64,
    pub first_deposit_at: i64,
    pub loyalty_tier: LoyaltyTier,
    pub total_operations: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AiDecisionLog {
    pub pool: Pubkey,
    pub update_number: u64,
    pub timestamp: i64,
    pub old_interest_rate: u16,
    pub new_interest_rate: u16,
    pub old_collateral_ratio: u16,
    pub new_collateral_ratio: u16,
    pub old_max_borrow: u64,
    pub new_max_borrow: u64,
    pub reasoning_hash: [u8; 32],
    #[max_len(256)]
    pub reasoning_short: String,
    pub confidence: u8,
    pub risk_level: RiskLevel,
    pub bump: u8,
}

// ============================================================
// ENUMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ProtocolMood {
    Thriving,
    Calm,
    Cautious,
    Defensive,
    Emergency,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum LoyaltyTier {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

// ============================================================
// ACCOUNTS VALIDATION
// ============================================================

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + LendingPool::INIT_SPACE,
        seeds = [b"lending_pool", authority.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = pool,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetSolPrice<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        constraint = signer.key() == pool.authority || signer.key() == pool.ai_agent @ LendError::Unauthorized,
    )]
    pub pool: Account<'info, LendingPool>,

    /// Signer — either authority or AI agent can update price
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateParameters<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = ai_agent,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        init,
        payer = ai_agent,
        space = 8 + AiDecisionLog::INIT_SPACE,
        seeds = [b"decision_log", pool.key().as_ref(), pool.total_ai_updates.to_le_bytes().as_ref()],
        bump
    )]
    pub decision_log: Account<'info, AiDecisionLog>,

    #[account(mut)]
    pub ai_agent: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyFreeze<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = authority,
    )]
    pub pool: Account<'info, LendingPool>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AiEmergencyFreeze<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = ai_agent,
    )]
    pub pool: Account<'info, LendingPool>,

    pub ai_agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = token_mint,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_token_account.owner == owner.key(),
        constraint = user_token_account.mint == token_mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = token_mint,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = user_position.bump,
        has_one = owner,
        has_one = pool,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_token_account.owner == owner.key(),
        constraint = user_token_account.mint == token_mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = user_position.bump,
        has_one = owner,
        has_one = pool,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = token_mint,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = user_position.bump,
        has_one = owner,
        has_one = pool,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_token_account.owner == owner.key(),
        constraint = user_token_account.mint == token_mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = token_mint,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = user_position.bump,
        has_one = owner,
        has_one = pool,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_token_account.owner == owner.key(),
        constraint = user_token_account.mint == token_mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
    #[account(
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), user_position.owner.as_ref()],
        bump = user_position.bump,
        has_one = pool,
    )]
    pub user_position: Account<'info, UserPosition>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = token_mint,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), borrower_position.owner.as_ref()],
        bump = borrower_position.bump,
        has_one = pool,
    )]
    pub borrower_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = liquidator_token_account.owner == liquidator.key(),
        constraint = liquidator_token_account.mint == token_mint.key(),
    )]
    pub liquidator_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub liquidator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MigratePool<'info> {
    /// CHECK: Pool account being migrated — validated by seed derivation + owner check
    #[account(
        mut,
        owner = crate::ID,
    )]
    pub pool: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Step 33: Guardrail accounts
#[derive(Accounts)]
pub struct InitGuardrails<'info> {
    #[account(
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = authority,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        init,
        payer = authority,
        space = 8 + GuardrailConfig::INIT_SPACE,
        seeds = [b"guardrails", pool.key().as_ref()],
        bump,
    )]
    pub guardrail_config: Account<'info, GuardrailConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateGuardrails<'info> {
    #[account(
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = authority,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"guardrails", pool.key().as_ref()],
        bump = guardrail_config.bump,
        has_one = authority,
    )]
    pub guardrail_config: Account<'info, GuardrailConfig>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetHealthFactor<'info> {
    #[account(
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        seeds = [b"position", pool.key().as_ref(), user_position.owner.as_ref()],
        bump = user_position.bump,
        has_one = pool,
    )]
    pub user_position: Account<'info, UserPosition>,
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct PoolInitializedEvent {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub ai_agent: Pubkey,
    pub token_mint: Pubkey,
    pub initial_rate_bps: u16,
    pub initial_collateral_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct DepositEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
    pub pool_total_deposits: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_deposit: u64,
    pub pool_available_liquidity: u64,
    pub timestamp: i64,
}

#[event]
pub struct CollateralDepositedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_collateral: u64,
    pub timestamp: i64,
}

#[event]
pub struct CollateralWithdrawnEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_collateral: u64,
    pub timestamp: i64,
}

#[event]
pub struct BorrowEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub total_borrowed: u64,
    pub collateral_sol: u64,
    pub timestamp: i64,
}

#[event]
pub struct RepayEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_borrow: u64,
    pub remaining_interest: u64,
    pub timestamp: i64,
}

#[event]
pub struct ParametersUpdatedEvent {
    pub pool: Pubkey,
    pub ai_agent: Pubkey,
    pub old_rate: u16,
    pub new_rate: u16,
    pub old_collateral: u16,
    pub new_collateral: u16,
    pub reasoning_short: String,
    pub risk_level: RiskLevel,
    pub confidence: u8,
    pub mood: ProtocolMood,
    pub update_number: u64,
    pub timestamp: i64,
}

#[event]
pub struct SolPriceUpdatedEvent {
    pub pool: Pubkey,
    pub price_usd: u64,
    pub updater: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyFreezeEvent {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyUnfreezeEvent {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct LiquidationEvent {
    pub pool: Pubkey,
    pub liquidator: Pubkey,
    pub borrower: Pubkey,
    pub repaid_amount: u64,
    pub collateral_seized: u64,
    pub keeper_reward: u64,
    pub health_factor_before: u64,
    pub health_factor_after: u64,
    pub timestamp: i64,
}

#[event]
pub struct HealthFactorEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub health_factor: u64,
    pub collateral_sol: u64,
    pub borrowed: u64,
    pub accrued_interest: u64,
    pub sol_price_usd: u64,
    pub timestamp: i64,
}

// Step 23: Auto-rate event
#[event]
pub struct AutoRateEvent {
    pub pool: Pubkey,
    pub new_rate: u16,
    pub danger_slots: u64,
    pub timestamp: i64,
}

// Step 33: Guardrails updated event
#[event]
pub struct GuardrailsUpdatedEvent {
    pub pool: Pubkey,
    pub config_hash: [u8; 32],
    pub timestamp: i64,
}

// Step 35: Bad debt covered event
#[event]
pub struct BadDebtCoveredEvent {
    pub pool: Pubkey,
    pub amount: u64,
    pub remaining_insurance: u64,
    pub timestamp: i64,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum LendError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient deposit balance")]
    InsufficientDeposit,
    #[msg("Insufficient pool liquidity")]
    InsufficientLiquidity,
    #[msg("Insufficient collateral for borrow")]
    InsufficientCollateral,
    #[msg("Borrow amount exceeds limit")]
    BorrowLimitExceeded,
    #[msg("Repay amount exceeds borrowed")]
    RepayExceedsBorrow,
    #[msg("Cannot withdraw collateral with active borrow")]
    HasActiveBorrow,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Interest rate below minimum")]
    RateTooLow,
    #[msg("Interest rate above maximum")]
    RateTooHigh,
    #[msg("Collateral ratio below minimum")]
    CollateralTooLow,
    #[msg("Collateral ratio above maximum")]
    CollateralTooHigh,
    #[msg("Parameter change exceeds 20% limit")]
    ChangeTooLarge,
    #[msg("Cooldown active: wait before next update")]
    CooldownActive,
    #[msg("Protocol is frozen")]
    ProtocolFrozen,
    #[msg("Position is healthy, cannot liquidate")]
    PositionHealthy,
    #[msg("Nothing to liquidate: no active borrow")]
    NothingToLiquidate,
    #[msg("Reasoning too long (max 256 chars)")]
    ReasoningTooLong,
    #[msg("Invalid or stale oracle price")]
    InvalidPrice,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("No active borrow to accrue interest on")]
    NoBorrowToAccrue,
    #[msg("Keeper reward exceeds maximum (5%)")]
    RewardTooHigh,
    #[msg("Withdrawal limit exceeded for this epoch")]
    WithdrawalLimitExceeded,
    #[msg("Insufficient insurance fund balance")]
    InsufficientInsurance,
}
