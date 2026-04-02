use anchor_lang::prelude::*;

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
        // Validate params consistency
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

        // Authority & agents
        pool.authority = ctx.accounts.authority.key();
        pool.ai_agent = params.ai_agent;
        pool.token_mint = ctx.accounts.token_mint.key();

        // Balances
        pool.total_deposits = 0;
        pool.total_borrows = 0;
        pool.available_liquidity = 0;
        pool.total_collateral_sol = 0;

        // AI-managed parameters (initial values)
        pool.interest_rate_bps = params.initial_interest_rate_bps;
        pool.collateral_ratio_bps = params.initial_collateral_ratio_bps;
        pool.max_borrow_limit = params.max_borrow_limit;
        pool.liquidation_threshold_bps = params.liquidation_threshold_bps;

        // Hard limits (immutable)
        pool.max_interest_rate_bps = params.max_interest_rate_bps;
        pool.min_interest_rate_bps = params.min_interest_rate_bps;
        pool.min_collateral_ratio_bps = params.min_collateral_ratio_bps;
        pool.max_collateral_ratio_bps = params.max_collateral_ratio_bps;

        // Protocol stats
        pool.total_deposits_count = 0;
        pool.total_borrows_count = 0;
        pool.total_ai_updates = 0;
        pool.total_ai_skips = 0;
        pool.total_liquidations = 0;
        pool.current_mood = ProtocolMood::Calm;
        pool.is_frozen = false;
        pool.protocol_created_at = now;

        // Meta
        pool.last_update = now;
        pool.update_cooldown = 600; // 10 minutes
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = 0; // set when vault is created in deposit step

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
}

// ============================================================
// PARAMS
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PoolParams {
    pub ai_agent: Pubkey,
    pub initial_interest_rate_bps: u16,     // e.g. 500 = 5%
    pub initial_collateral_ratio_bps: u16,  // e.g. 15000 = 150%
    pub max_borrow_limit: u64,
    pub liquidation_threshold_bps: u16,     // e.g. 12000 = 120%
    pub max_interest_rate_bps: u16,         // hard ceiling
    pub min_interest_rate_bps: u16,         // hard floor
    pub min_collateral_ratio_bps: u16,
    pub max_collateral_ratio_bps: u16,
}

// ============================================================
// STATE ACCOUNTS
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct LendingPool {
    // Authority & agents
    pub authority: Pubkey,
    pub ai_agent: Pubkey,
    pub token_mint: Pubkey,

    // Balances (aiUSDC lamports / SOL lamports)
    pub total_deposits: u64,
    pub total_borrows: u64,
    pub available_liquidity: u64,
    pub total_collateral_sol: u64,

    // === AI-managed parameters ===
    pub interest_rate_bps: u16,
    pub collateral_ratio_bps: u16,
    pub max_borrow_limit: u64,
    pub liquidation_threshold_bps: u16,

    // === Hard limits (AI cannot change) ===
    pub max_interest_rate_bps: u16,
    pub min_interest_rate_bps: u16,
    pub min_collateral_ratio_bps: u16,
    pub max_collateral_ratio_bps: u16,

    // === Protocol stats ===
    pub total_deposits_count: u64,
    pub total_borrows_count: u64,
    pub total_ai_updates: u64,
    pub total_ai_skips: u64,
    pub total_liquidations: u64,
    pub current_mood: ProtocolMood,
    pub is_frozen: bool,
    pub protocol_created_at: i64,

    // === Meta ===
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

    /// CHECK: token mint address, stored in pool state. Validated at deposit time.
    pub token_mint: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
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
