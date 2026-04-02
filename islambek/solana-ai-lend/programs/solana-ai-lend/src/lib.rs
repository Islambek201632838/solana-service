use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("HfTwgCwDTHpfrCKkgrruiuHaMKj79AVjyQSTwyoH9NVy");

// ============================================================
// PROGRAM
// ============================================================

#[program]
pub mod solana_ai_lend {
    use super::*;

    /// Initialize the lending pool (one-time setup).
    /// PDA: seeds = ["lending_pool", authority]
    pub fn initialize_pool(ctx: Context<InitPool>, params: PoolParams) -> Result<()> {
        require!(params.min_interest_rate_bps <= params.max_interest_rate_bps, LendError::RateTooLow);
        require!(params.initial_interest_rate_bps >= params.min_interest_rate_bps, LendError::RateTooLow);
        require!(params.initial_interest_rate_bps <= params.max_interest_rate_bps, LendError::RateTooHigh);
        require!(params.min_collateral_ratio_bps <= params.max_collateral_ratio_bps, LendError::CollateralTooLow);
        require!(params.initial_collateral_ratio_bps >= params.min_collateral_ratio_bps, LendError::CollateralTooLow);
        require!(params.initial_collateral_ratio_bps <= params.max_collateral_ratio_bps, LendError::CollateralTooHigh);
        require!(params.liquidation_threshold_bps > 0, LendError::ZeroAmount);
        require!(params.max_borrow_limit > 0, LendError::ZeroAmount);

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

        pool.total_deposits_count = 0;
        pool.total_borrows_count = 0;
        pool.total_ai_updates = 0;
        pool.total_ai_skips = 0;
        pool.total_liquidations = 0;
        pool.current_mood = ProtocolMood::Calm;
        pool.is_frozen = false;
        pool.protocol_created_at = now;

        pool.last_update = now;
        pool.update_cooldown = 600;
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

    /// Deposit aiUSDC into the pool.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);

        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.user_position;
        let now = Clock::get()?.unix_timestamp;

        // Transfer tokens: user → vault
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

        // Update pool
        pool.total_deposits = pool.total_deposits.checked_add(amount).ok_or(LendError::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_add(amount).ok_or(LendError::MathOverflow)?;
        pool.total_deposits_count = pool.total_deposits_count.checked_add(1).ok_or(LendError::MathOverflow)?;

        // Update user position
        if position.deposited == 0 && position.borrowed == 0 {
            // First interaction — initialize position fields
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

    /// Withdraw aiUSDC from the pool.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, LendError::ZeroAmount);

        let position = &ctx.accounts.user_position;
        require!(amount <= position.deposited, LendError::InsufficientDeposit);

        let pool = &ctx.accounts.pool;
        require!(amount <= pool.available_liquidity, LendError::InsufficientLiquidity);

        // Transfer tokens: vault → user (PDA signer)
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

        // Update pool
        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;
        pool.total_deposits = pool.total_deposits.checked_sub(amount).ok_or(LendError::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_sub(amount).ok_or(LendError::MathOverflow)?;

        // Update user position
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
}

// ============================================================
// PARAMS
// ============================================================

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

    pub total_deposits_count: u64,
    pub total_borrows_count: u64,
    pub total_ai_updates: u64,
    pub total_ai_skips: u64,
    pub total_liquidations: u64,
    pub current_mood: ProtocolMood,
    pub is_frozen: bool,
    pub protocol_created_at: i64,

    pub last_update: i64,
    pub update_cooldown: i64,
    pub bump: u8,
    pub vault_bump: u8,
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
}
