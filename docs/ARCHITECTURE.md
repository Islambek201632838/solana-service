# AI-Powered Adaptive Lending Protocol on Solana
## Архитектура проекта — SolanaAI Lend

---

## 1. Продукт в одном предложении

Лендинг-протокол на Solana где AI (Gemini) автономно управляет процентными ставками, залоговыми коэффициентами и лимитами — адаптируясь к рынку в реальном времени, при этом смарт-контракт жёстко ограничивает AI рамками безопасности.

---

## 2. Сеть и токены

```
Сеть:     Solana DEVNET (тестовая сеть, бесплатная)
RPC:      https://api.devnet.solana.com
SOL:      бесплатный airdrop (solana airdrop 2)
Токены:   создаём свой SPL-токен "aiUSDC" для имитации USDC

ВАЖНО: Никаких реальных денег. Всё на devnet.

Получение тестовых SOL:
  solana config set --url devnet
  solana-keygen new                    # создать кошелёк
  solana airdrop 2                     # получить 2 SOL бесплатно
  solana airdrop 2                     # ещё 2 SOL (лимит ~4 SOL за раз)

Создание тестового токена (aiUSDC):
  spl-token create-token               # создать токен
  spl-token create-account <MINT>      # создать аккаунт
  spl-token mint <MINT> 1000000        # намайнить 1M тестовых aiUSDC
```

---

## 3. Какую проблему решаем

Существующие DeFi лендинг-протоколы (Aave, Compound) используют **статичные формулы** для расчёта ставок. Это приводит к:

- Ставки не отражают реальный рыночный риск
- Ликвидации происходят слишком поздно или слишком рано
- Параметры меняются только через голосование (дни/недели)
- Протоколы не реагируют на резкие изменения рынка

**Наше решение:** AI анализирует рынок каждые 10 минут и адаптирует параметры протокола автоматически, а контракт гарантирует что AI не выйдет за безопасные рамки.

---

## 4. Общая архитектура

```
                      ПОЛЬЗОВАТЕЛИ
                      │         │
                Лендер│         │Заёмщик
                (даёт)│         │(берёт)
                      ▼         ▼
           ┌──────────────────────────┐
           │   FRONTEND (React+Vite)  │
           │                          │
           │  Dashboard │ Deposit │   │
           │  Borrow │ AI Log │       │
           └──────┬──────────┬────────┘
                  │          │
   REST/WebSocket │          │ @solana/wallet-adapter
   (чтение данных)│          │ (подпись TX — Phantom)
                  │          │
                  ▼          ▼
        ┌──────────────┐  ┌────────────────────────┐
        │  FastAPI      │  │  Solana DEVNET         │
        │  Backend      │  │                        │
        │  (Python)     │  │  Smart Contract        │
        │               │  │  (Anchor/Rust)         │
        │ /api/pool     │  │                        │
        │ /api/decisions│  │  Vault │ Lending       │
        │ /ws/updates   │  │  Params │ Logs         │
        └───┬───┬───────┘  └───────────▲────────────┘
            │   │                      │
            │   │   ┌──────────────────┘
            │   │   │
            ▼   │   │
   ┌────────────┴───┴──────────┐
   │       AI AGENT            │
   │       (Python Async)      │
   │                           │
   │  Gemini API + AsyncIO +   │
   │  Multithread              │
   └──────────┬────────────────┘
              │
       ┌──────┼────────┐
       ▼      ▼        ▼
    ┌─────┐┌─────┐┌────────┐
    │Pyth ││Jup. ││CoinGko │
    │Price││Liq. ││Trends  │
    └─────┘└─────┘└────────┘

Frontend читает данные через FastAPI (REST + WebSocket).
Frontend подписывает транзакции напрямую через Phantom → Solana.
AI Agent пишет решения в Solana + SQLite, FastAPI отдаёт их фронту.
Все взаимодействия через Solana DEVNET (тестовые SOL + aiUSDC).
```

---

## 5. Смарт-контракт (Anchor/Rust)

### 5.1 Аккаунты (данные в блокчейне)

```rust
// Параметры инициализации пула
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PoolParams {
    pub ai_agent: Pubkey,
    pub initial_interest_rate_bps: u16,
    pub initial_collateral_ratio_bps: u16,
    pub max_borrow_limit: u64,
    pub liquidation_threshold: u16,
    pub max_interest_rate_bps: u16,
    pub min_interest_rate_bps: u16,
    pub min_collateral_ratio_bps: u16,
    pub max_collateral_ratio_bps: u16,
    pub sol_usd_price_feed: Pubkey,     // Pyth devnet SOL/USD price feed
}

// Главный пул ликвидности
#[account]
#[derive(InitSpace)]
pub struct LendingPool {
    pub authority: Pubkey,              // создатель протокола
    pub ai_agent: Pubkey,              // адрес AI-агента (только он меняет параметры)
    pub token_mint: Pubkey,            // адрес aiUSDC токена
    pub sol_usd_price_feed: Pubkey,    // Pyth oracle SOL/USD (devnet)
    pub total_deposits: u64,           // всего депозитов (aiUSDC)
    pub total_borrows: u64,            // всего займов (aiUSDC)
    pub available_liquidity: u64,      // свободная ликвидность (aiUSDC)
    pub total_collateral_sol: u64,     // всего залога в lamports (SOL)

    // === ПАРАМЕТРЫ КОТОРЫЕ AI МЕНЯЕТ ===
    pub interest_rate_bps: u16,        // процентная ставка (basis points, 500 = 5%)
    pub collateral_ratio_bps: u16,     // залоговый коэффициент (15000 = 150%)
    pub max_borrow_limit: u64,         // макс сумма одного займа (aiUSDC)
    pub liquidation_threshold: u16,    // порог ликвидации (basis points)

    // === ЖЁСТКИЕ ЛИМИТЫ (AI НЕ МОЖЕТ ИЗМЕНИТЬ) ===
    pub max_interest_rate_bps: u16,
    pub min_interest_rate_bps: u16,
    pub min_collateral_ratio_bps: u16,
    pub max_collateral_ratio_bps: u16,

    // === PROTOCOL STATS (on-chain метрики) ===
    pub total_deposits_count: u64,     // всего операций deposit
    pub total_borrows_count: u64,      // всего операций borrow
    pub total_ai_updates: u64,         // сколько раз AI обновлял параметры
    pub total_ai_skips: u64,           // сколько раз AI пропустил цикл
    pub total_liquidations: u64,       // сколько ликвидаций
    pub current_mood: ProtocolMood,    // визуальный индикатор состояния
    pub is_frozen: bool,               // экстренная остановка
    pub protocol_created_at: i64,      // когда создан протокол

    // === META ===
    pub last_update: i64,
    pub update_cooldown: i64,          // мин интервал между обновлениями (600 сек)
    pub bump: u8,
}

// Позиция пользователя
#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub deposited: u64,                // сколько дал в пул (aiUSDC)
    pub borrowed: u64,                 // сколько взял займ (aiUSDC)
    pub collateral_sol: u64,           // сколько залога (SOL lamports)
    pub borrow_timestamp: i64,         // когда взял займ (для расчёта процентов)
    pub last_interest_update: i64,     // когда последний раз считали проценты
    pub accrued_interest: u64,         // накопленные проценты для лендера
    pub first_deposit_at: i64,         // для loyalty tier
    pub loyalty_tier: LoyaltyTier,     // Bronze/Silver/Gold/Platinum
    pub total_operations: u32,         // всего операций пользователя
    pub bump: u8,
}

// Лог решения AI (записывается on-chain)
// PDA seeds: ["decision_log", pool, update_count.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct AiDecisionLog {
    pub pool: Pubkey,
    pub update_number: u64,            // порядковый номер (для PDA и сортировки)
    pub timestamp: i64,
    pub old_interest_rate: u16,
    pub new_interest_rate: u16,
    pub old_collateral_ratio: u16,
    pub new_collateral_ratio: u16,
    pub old_max_borrow: u64,
    pub new_max_borrow: u64,
    pub reasoning_hash: [u8; 32],      // SHA256 полного текста (proof)
    #[max_len(256)]
    pub reasoning_short: String,       // краткое объяснение ON-CHAIN
    pub confidence: u8,                // уверенность AI (0-100)
    pub risk_level: RiskLevel,         // Low/Medium/High/Critical
    pub bump: u8,
}

// Enums
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ProtocolMood {
    Thriving,     // low risk, стабильный рост
    Calm,         // low risk, боковик
    Cautious,     // medium risk
    Defensive,    // high risk
    Emergency,    // critical risk или frozen
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RiskLevel { Low, Medium, High, Critical }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum LoyaltyTier { Bronze, Silver, Gold, Platinum }
```

### 5.2 Инструкции (функции контракта)

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("YOUR_PROGRAM_ID_AFTER_DEPLOY");

#[program]
pub mod solana_ai_lend {
    use super::*;

    // ========== ADMIN ==========

    /// Инициализация пула (один раз). PDA = seeds=["lending_pool", authority]
    pub fn initialize_pool(
        ctx: Context<InitPool>,
        params: PoolParams,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.ai_agent = params.ai_agent;
        pool.token_mint = ctx.accounts.token_mint.key();
        pool.total_deposits = 0;
        pool.total_borrows = 0;
        pool.available_liquidity = 0;

        // AI-управляемые параметры (начальные)
        pool.interest_rate_bps = params.initial_interest_rate_bps;
        pool.collateral_ratio_bps = params.initial_collateral_ratio_bps;
        pool.max_borrow_limit = params.max_borrow_limit;
        pool.liquidation_threshold = params.liquidation_threshold;

        // Жёсткие лимиты (неизменяемые)
        pool.max_interest_rate_bps = params.max_interest_rate_bps;
        pool.min_interest_rate_bps = params.min_interest_rate_bps;
        pool.min_collateral_ratio_bps = params.min_collateral_ratio_bps;
        pool.max_collateral_ratio_bps = params.max_collateral_ratio_bps;

        pool.sol_usd_price_feed = params.sol_usd_price_feed;
        pool.total_collateral_sol = 0;
        pool.total_deposits_count = 0;
        pool.total_borrows_count = 0;
        pool.total_ai_updates = 0;
        pool.total_ai_skips = 0;
        pool.total_liquidations = 0;
        pool.current_mood = ProtocolMood::Calm;
        pool.is_frozen = false;
        pool.protocol_created_at = Clock::get()?.unix_timestamp;
        pool.last_update = Clock::get()?.unix_timestamp;
        pool.update_cooldown = 600; // 10 мин
        pool.bump = ctx.bumps.pool;

        Ok(())
    }

    // ========== ПОЛЬЗОВАТЕЛЬСКИЕ ФУНКЦИИ ==========

    /// Лендер кладёт aiUSDC в пул. PDA позиции = seeds=["position", pool, owner]
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);

        // SPL-токен трансфер: user_token_account → pool_vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token::transfer(cpi_ctx, amount)?;

        // Обновить позицию пользователя
        let position = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;

        // Первый deposit — инициализировать время
        if position.first_deposit_at == 0 {
            position.first_deposit_at = now;
            position.last_interest_update = now;
            position.owner = ctx.accounts.owner.key();
            position.loyalty_tier = LoyaltyTier::Bronze;
        }

        position.deposited = position.deposited
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        position.total_operations += 1;

        // Обновить пул
        let pool = &mut ctx.accounts.pool;
        pool.total_deposits = pool.total_deposits
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.total_deposits_count += 1;

        emit!(DepositEvent {
            user: ctx.accounts.owner.key(),
            amount,
            total_deposits: pool.total_deposits,
        });

        Ok(())
    }

    /// Лендер забирает aiUSDC + проценты
    /// ВАЖНО: начисляем проценты перед выводом, чтобы пользователь не терял доход
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);

        // Начислить проценты перед выводом
        let pool = &ctx.accounts.pool;
        let position = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.saturating_sub(position.last_interest_update) as u64;
        if elapsed > 0 && position.deposited > 0 {
            let seconds_per_year: u64 = 31_557_600;
            let interest = (position.deposited as u128)
                .checked_mul(pool.interest_rate_bps as u128).ok_or(ErrorCode::MathOverflow)?
                .checked_mul(elapsed as u128).ok_or(ErrorCode::MathOverflow)?
                .checked_div(seconds_per_year as u128 * 10000).ok_or(ErrorCode::MathOverflow)? as u64;
            position.accrued_interest = position.accrued_interest
                .checked_add(interest).ok_or(ErrorCode::MathOverflow)?;
            position.last_interest_update = now;
        }

        // withdrawable = deposited + accrued_interest
        let withdrawable = position.deposited
            .checked_add(position.accrued_interest).ok_or(ErrorCode::MathOverflow)?;
        require!(withdrawable >= amount, ErrorCode::InsufficientDeposit);

        let pool = &ctx.accounts.pool;
        require!(pool.available_liquidity >= amount, ErrorCode::InsufficientLiquidity);

        // SPL-токен трансфер: pool_vault → user (подпись PDA)
        let authority_key = ctx.accounts.pool.authority.key();
        let seeds = &[
            b"lending_pool",
            authority_key.as_ref(),
            &[ctx.accounts.pool.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        // Обновить
        let position = &mut ctx.accounts.position;
        position.deposited = position.deposited
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_deposits = pool.total_deposits
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(())
    }

    /// Заёмщик вносит SOL как залог (отдельно от deposit aiUSDC)
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, ErrorCode::ZeroAmount);

        // Перевод SOL: user → pool PDA через system_program
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),  // SOL хранится в PDA пула
                },
            ),
            amount_lamports,
        )?;

        let position = &mut ctx.accounts.position;
        position.collateral_sol = position.collateral_sol
            .checked_add(amount_lamports).ok_or(ErrorCode::MathOverflow)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_collateral_sol = pool.total_collateral_sol
            .checked_add(amount_lamports).ok_or(ErrorCode::MathOverflow)?;

        emit!(CollateralDepositedEvent {
            user: ctx.accounts.owner.key(),
            amount_lamports,
        });
        Ok(())
    }

    /// Заёмщик забирает залог SOL (после repay)
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount_lamports: u64) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(position.borrowed == 0, ErrorCode::HasActiveBorrow); // нельзя забрать залог с активным займом
        require!(position.collateral_sol >= amount_lamports, ErrorCode::InsufficientCollateral);

        // SOL transfer: pool PDA → user (PDA signer)
        // ... аналогично withdraw, но для SOL через lamports transfer
        Ok(())
    }

    /// Заёмщик берёт займ (нужен предварительный deposit_collateral)
    /// Использует Pyth oracle для конвертации SOL collateral → USD value
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);
        let pool = &ctx.accounts.pool;
        require!(!pool.is_frozen, ErrorCode::ProtocolFrozen);
        require!(amount <= pool.max_borrow_limit, ErrorCode::BorrowLimitExceeded);
        require!(pool.available_liquidity >= amount, ErrorCode::InsufficientLiquidity);

        // Получить цену SOL/USD из Pyth oracle (devnet)
        let price_feed = &ctx.accounts.sol_price_feed;
        let sol_price_usd = get_pyth_price(price_feed)?; // цена в USD * 10^6

        // Конвертация: collateral_sol (lamports) → USD value
        let position = &ctx.accounts.position;
        let collateral_usd = (position.collateral_sol as u128)
            .checked_mul(sol_price_usd as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000).ok_or(ErrorCode::MathOverflow)? as u64; // lamports → SOL → USD

        // Проверка: collateral_usd >= borrow_amount * collateral_ratio / 10000
        let required_collateral_usd = (amount as u128)
            .checked_mul(pool.collateral_ratio_bps as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)? as u64;
        require!(collateral_usd >= required_collateral_usd, ErrorCode::InsufficientCollateral);

        // ... SPL transfer pool_vault → user + обновить состояние
        let position = &mut ctx.accounts.position;
        position.borrowed = position.borrowed.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        position.borrow_timestamp = Clock::get()?.unix_timestamp;

        let pool = &mut ctx.accounts.pool;
        pool.total_borrows = pool.total_borrows.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
        pool.total_borrows_count += 1;

        emit!(BorrowEvent {
            user: ctx.accounts.owner.key(),
            amount,
            collateral_sol: position.collateral_sol,
            interest_rate_bps: pool.interest_rate_bps,
        });
        Ok(())
    }

    /// Начисление процентов (может вызвать кто угодно, обновляет позицию)
    pub fn accrue_interest(ctx: Context<AccrueInterest>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let position = &mut ctx.accounts.position;

        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.checked_sub(position.last_interest_update)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        if elapsed == 0 || position.deposited == 0 { return Ok(()); }

        // Simple interest: accrued = deposited * rate_bps * elapsed / (365.25 * 86400 * 10000)
        let seconds_per_year: u64 = 31_557_600; // 365.25 * 86400
        let interest = (position.deposited as u128)
            .checked_mul(pool.interest_rate_bps as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_mul(elapsed as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(seconds_per_year as u128 * 10000).ok_or(ErrorCode::MathOverflow)? as u64;

        position.accrued_interest = position.accrued_interest
            .checked_add(interest).ok_or(ErrorCode::MathOverflow)?;
        position.last_interest_update = now;

        Ok(())
    }

    /// Заёмщик возвращает займ
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);
        let position = &ctx.accounts.position;
        require!(position.borrowed >= amount, ErrorCode::RepayExceedsBorrow);

        // ... SPL transfer user → pool_vault
        let position = &mut ctx.accounts.position;
        position.borrowed = position.borrowed.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_borrows = pool.total_borrows.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
        pool.available_liquidity = pool.available_liquidity.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        emit!(RepayEvent { user: ctx.accounts.owner.key(), amount });
        Ok(())
    }

    // ========== AI ФУНКЦИИ (только AI-агент) ==========

    /// AI обновляет параметры протокола.
    /// Anchor constraint `has_one = ai_agent` гарантирует что signer == pool.ai_agent.
    pub fn update_parameters(
        ctx: Context<UpdateParams>,
        new_interest_rate: u16,
        new_collateral_ratio: u16,
        new_max_borrow: u64,
        reasoning_hash: [u8; 32],
        reasoning_short: String,       // краткое объяснение (≤256 chars)
        confidence: u8,
        risk_level: RiskLevel,
    ) -> Result<()> {
        require!(reasoning_short.len() <= 256, ErrorCode::ReasoningTooLong);

        let pool = &mut ctx.accounts.pool;
        require!(!pool.is_frozen, ErrorCode::ProtocolFrozen);

        // ПРОВЕРКА 1: авторизация — has_one = ai_agent в Anchor

        // ПРОВЕРКА 2: прошёл cooldown?
        let now = Clock::get()?.unix_timestamp;
        require!(
            now.saturating_sub(pool.last_update) >= pool.update_cooldown,
            ErrorCode::CooldownActive
        );

        // ПРОВЕРКА 3: ставка в допустимых рамках?
        require!(new_interest_rate >= pool.min_interest_rate_bps, ErrorCode::RateTooLow);
        require!(new_interest_rate <= pool.max_interest_rate_bps, ErrorCode::RateTooHigh);

        // ПРОВЕРКА 4: залог в допустимых рамках?
        require!(new_collateral_ratio >= pool.min_collateral_ratio_bps, ErrorCode::CollateralTooLow);
        require!(new_collateral_ratio <= pool.max_collateral_ratio_bps, ErrorCode::CollateralTooHigh);

        // ПРОВЕРКА 5: изменение не слишком резкое? (макс 20% за раз)
        let rate_change = abs_diff(new_interest_rate, pool.interest_rate_bps);
        require!(
            rate_change <= pool.interest_rate_bps.checked_div(5).unwrap_or(0),
            ErrorCode::ChangeTooLarge
        );

        // Сохранить старые значения для лога
        let old_rate = pool.interest_rate_bps;
        let old_collateral = pool.collateral_ratio_bps;
        let old_max_borrow = pool.max_borrow_limit;

        // ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ — обновляем
        pool.interest_rate_bps = new_interest_rate;
        pool.collateral_ratio_bps = new_collateral_ratio;
        pool.max_borrow_limit = new_max_borrow;
        pool.last_update = now;
        pool.total_ai_updates += 1;

        // Обновить mood на основе risk_level
        pool.current_mood = match risk_level {
            RiskLevel::Low => ProtocolMood::Thriving,
            RiskLevel::Medium => ProtocolMood::Cautious,
            RiskLevel::High => ProtocolMood::Defensive,
            RiskLevel::Critical => ProtocolMood::Emergency,
        };

        // Записать AiDecisionLog
        // PDA seeds: ["decision_log", pool, total_ai_updates.to_le_bytes()]
        let log = &mut ctx.accounts.decision_log;
        log.pool = ctx.accounts.pool.key();
        log.update_number = pool.total_ai_updates;
        log.timestamp = now;
        log.old_interest_rate = old_rate;
        log.new_interest_rate = new_interest_rate;
        log.old_collateral_ratio = old_collateral;
        log.new_collateral_ratio = new_collateral_ratio;
        log.old_max_borrow = old_max_borrow;
        log.new_max_borrow = new_max_borrow;
        log.reasoning_hash = reasoning_hash;
        log.reasoning_short = reasoning_short;
        log.confidence = confidence;
        log.risk_level = risk_level;
        log.bump = ctx.bumps.decision_log;

        emit!(ParametersUpdatedEvent {
            pool: ctx.accounts.pool.key(),
            old_rate,
            new_rate: new_interest_rate,
            old_collateral,
            new_collateral: new_collateral_ratio,
            confidence,
            risk_level,
            ai_update_count: pool.total_ai_updates,
            timestamp: now,
        });

        Ok(())
    }

    /// Ликвидация (может вызвать кто угодно — ликвидатор получает бонус)
    /// Использует Pyth oracle для проверки что позиция действительно undercollateralized
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let position = &ctx.accounts.borrower_position;
        require!(position.borrowed > 0, ErrorCode::NothingToLiquidate);

        // Получить цену SOL/USD из Pyth oracle
        let sol_price_usd = get_pyth_price(&ctx.accounts.sol_price_feed)?;

        // Конвертация залога SOL → USD
        let collateral_usd = (position.collateral_sol as u128)
            .checked_mul(sol_price_usd as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000).ok_or(ErrorCode::MathOverflow)? as u64;

        // Минимальный залог = borrowed * liquidation_threshold / 10000
        let min_collateral_usd = (position.borrowed as u128)
            .checked_mul(pool.liquidation_threshold as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)? as u64;

        require!(collateral_usd < min_collateral_usd, ErrorCode::PositionHealthy);

        // Ликвидация: залог → ликвидатору (с 5% бонусом), долг списывается
        // ... перевод SOL ликвидатору, списание borrowed

        let pool = &mut ctx.accounts.pool;
        pool.total_liquidations += 1;

        emit!(LiquidationEvent {
            borrower: position.owner,
            liquidator: ctx.accounts.liquidator.key(),
            collateral_seized: position.collateral_sol,
            debt_repaid: position.borrowed,
            sol_price_usd,
        });
        Ok(())
    }
}

// ══════════════════════════════════════════════════════════════
// ANCHOR ACCOUNT VALIDATION — #[derive(Accounts)] с constraints
// ══════════════════════════════════════════════════════════════

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
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, anchor_spl::token::Mint>,

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
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump,
        token::mint = pool.token_mint,
        token::authority = pool
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = pool.token_mint,
        token::authority = owner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner  // position.owner == signer
    )]
    pub position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump,
        token::mint = pool.token_mint,
        token::authority = pool
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = pool.token_mint,
        token::authority = owner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump,
        token::mint = pool.token_mint,
        token::authority = pool
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = pool.token_mint,
        token::authority = owner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Pyth SOL/USD price feed (devnet)
    /// CHECK: validated by constraint matching pool.sol_usd_price_feed
    #[account(constraint = sol_price_feed.key() == pool.sol_usd_price_feed)]
    pub sol_price_feed: UncheckedAccount<'info>,

    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = pool.token_mint,
        token::authority = owner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

/// КЛЮЧЕВОЙ МОМЕНТ: has_one = ai_agent означает pool.ai_agent == ai_agent.key()
/// Anchor проверяет это ДО входа в функцию. Если не совпадает — TX отклоняется.
#[derive(Accounts)]
pub struct UpdateParams<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump,
        has_one = ai_agent  // pool.ai_agent == ai_agent.key()
    )]
    pub pool: Account<'info, LendingPool>,

    /// AI-агент должен подписать TX. Anchor проверяет через has_one.
    pub ai_agent: Signer<'info>,

    /// Лог решения AI — PDA с update_count (НЕ Clock — Clock недоступен в seeds)
    #[account(
        init,
        payer = ai_agent,
        space = 8 + AiDecisionLog::INIT_SPACE,
        seeds = [
            b"decision_log",
            pool.key().as_ref(),
            &(pool.total_ai_updates + 1).to_le_bytes()  // следующий номер
        ],
        bump
    )]
    pub decision_log: Account<'info, AiDecisionLog>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, UserPosition>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, UserPosition>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
    #[account(
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, UserPosition>,
    // Любой может вызвать — не требует Signer кроме fee payer
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(
        mut,
        seeds = [b"lending_pool", pool.authority.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LendingPool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), borrower.key().as_ref()],
        bump = borrower_position.bump,
        constraint = borrower_position.owner == borrower.key() @ ErrorCode::InvalidBorrower
    )]
    pub borrower_position: Account<'info, UserPosition>,

    /// CHECK: validated by PDA seeds + constraint above
    pub borrower: UncheckedAccount<'info>,

    /// Pyth SOL/USD price feed
    #[account(constraint = sol_price_feed.key() == pool.sol_usd_price_feed)]
    pub sol_price_feed: UncheckedAccount<'info>,

    #[account(mut)]
    pub liquidator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ══════════════════════════════════════════════════════════════
// EVENTS (эмитятся on-chain, читаются через RPC / WebSocket)
// ══════════════════════════════════════════════════════════════

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
}

#[event]
pub struct CollateralDepositedEvent {
    pub user: Pubkey,
    pub amount_lamports: u64,
}

#[event]
pub struct BorrowEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub collateral_sol: u64,
    pub interest_rate_bps: u16,
}

#[event]
pub struct RepayEvent {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LiquidationEvent {
    pub borrower: Pubkey,
    pub liquidator: Pubkey,
    pub collateral_seized: u64,
    pub debt_repaid: u64,
    pub sol_price_usd: u64,
}

#[event]
pub struct ParametersUpdatedEvent {
    pub pool: Pubkey,
    pub old_rate: u16,
    pub new_rate: u16,
    pub old_collateral: u16,
    pub new_collateral: u16,
    pub confidence: u8,
    pub risk_level: RiskLevel,
    pub ai_update_count: u64,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyFreezeEvent {
    pub authority: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

// ══════════════════════════════════════════════════════════════
// ERRORS
// ══════════════════════════════════════════════════════════════

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: only AI agent can call this")]
    Unauthorized,
    #[msg("Cooldown active: wait before next update")]
    CooldownActive,
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
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Position is healthy, cannot liquidate")]
    PositionHealthy,
    #[msg("Invalid borrower for liquidation")]
    InvalidBorrower,
    #[msg("Cannot withdraw collateral with active borrow")]
    HasActiveBorrow,
    #[msg("Protocol is frozen by emergency")]
    ProtocolFrozen,
    #[msg("Nothing to liquidate: no active borrow")]
    NothingToLiquidate,
    #[msg("Reasoning too long (max 256 chars)")]
    ReasoningTooLong,
    #[msg("Invalid or stale price from oracle")]
    InvalidPrice,
}

fn abs_diff(a: u16, b: u16) -> u16 {
    if a > b { a - b } else { b - a }
}
```

### 5.3 Защиты контракта (Guard Rails)

```
НЕИЗМЕНЯЕМЫЕ ПРАВИЛА:
├── Ставка: 1% — 20% (AI не может выйти за рамки)
├── Залог: 120% — 200% (AI не может опустить ниже 120%)
├── Cooldown: 10 минут между обновлениями
├── Макс изменение: 20% от текущего значения за раз
├── Только AI-агент может вызвать update_parameters
├── Пользователь ВСЕГДА может withdraw свой депозит
└── Пользователь ВСЕГДА может repay свой займ
```

---

## 6. AI Agent — Async Multithread Architecture (Python)

### 6.0 Ключевой принцип: AI не угадывает — AI считает

```
СТАРЫЙ ПОДХОД (плохо):
  Сырые данные → Gemini → "мне кажется ставку надо поднять"
  Проблема: LLM галлюцинирует, нет обоснования, нет воспроизводимости

НАШ ПОДХОД (правильно):
  Сырые данные → Мат. анализ → ML модели → Количественный отчёт → Gemini

  Gemini НЕ РЕШАЕТ сам. Он ИНТЕРПРЕТИРУЕТ результаты математики.
  Все числа — из формул. Gemini только выбирает финальные параметры
  на основе количественных сигналов.
```

```
ПАЙПЛАЙН ПРИНЯТИЯ РЕШЕНИЙ:

┌────────────────────────────────────────────────────────────────┐
│  ЭТАП 1: СБОР ДАННЫХ (async, параллельно)                     │
│  CoinGecko + Pyth + Jupiter + Solana RPC                      │
└───────────────────────┬────────────────────────────────────────┘
                        ▼
┌────────────────────────────────────────────────────────────────┐
│  ЭТАП 2: КОЛИЧЕСТВЕННЫЙ АНАЛИЗ (CPU, ThreadPool)              │
│                                                                │
│  ┌─ Technical Indicators ─┐  ┌─ ML Models ──────────────────┐ │
│  │ RSI (14 периодов)      │  │ IsolationForest (аномалии)   │ │
│  │ MACD (12/26/9)         │  │ LinearRegression (тренд)     │ │
│  │ Bollinger Bands (20,2) │  │ GARCH-lite (волатильность)   │ │
│  │ EMA 9 / EMA 21         │  │ Risk Score Model (скоринг)   │ │
│  │ ATR (волатильность)    │  │ Utilization Predictor        │ │
│  └────────────────────────┘  └──────────────────────────────┘ │
│                                                                │
│  ┌─ Utilization Curve ────┐  ┌─ Statistical Metrics ────────┐ │
│  │ Оптимальная ставка     │  │ Sharpe-like risk ratio       │ │
│  │ по формуле Aave:       │  │ Value-at-Risk (VaR 95%)      │ │
│  │ R = R0 + Ut/Uo * Rmax  │  │ Correlation SOL/BTC          │ │
│  │ (кривая утилизации)    │  │ Z-score текущей цены         │ │
│  └────────────────────────┘  └──────────────────────────────┘ │
│                                                                │
│  Результат: QuantReport (все числа, все сигналы)              │
└───────────────────────┬────────────────────────────────────────┘
                        ▼
┌────────────────────────────────────────────────────────────────┐
│  ЭТАП 3: GEMINI ИНТЕРПРЕТАЦИЯ (async)                         │
│                                                                │
│  Вход: QuantReport (НЕ сырые данные!)                         │
│  Gemini получает:                                              │
│  - RSI = 72 (перекуплен)                                      │
│  - MACD = bearish crossover                                    │
│  - Рекомендация модели ставки: 6.8% (по формуле)              │
│  - ML anomaly score: 0.3 (норма)                              │
│  - VaR 95%: -8.2%                                             │
│  - Risk score: 62/100 (medium)                                │
│  - Рекомендация кривой утилизации: повысить ставку             │
│                                                                │
│  Gemini выбирает ФИНАЛЬНЫЕ параметры в рамках рекомендаций    │
│  математики. НЕ придумывает числа — выбирает из диапазона.    │
└───────────────────────┬────────────────────────────────────────┘
                        ▼
┌────────────────────────────────────────────────────────────────┐
│  ЭТАП 4: ВАЛИДАЦИЯ + ON-CHAIN TX                              │
└────────────────────────────────────────────────────────────────┘
```

### 6.1 Почему async + multithread

```
ПРОБЛЕМА: AI-агент делает много I/O + CPU операций:
├── HTTP запрос к Pyth Oracle       ~200ms   (I/O)
├── HTTP запрос к Jupiter API       ~300ms   (I/O)
├── HTTP запрос к CoinGecko         ~500ms   (I/O)
├── RPC запрос к Solana             ~150ms   (I/O)
├── Мат. анализ (RSI, MACD, BB)    ~50ms    (CPU)
├── ML модели (sklearn)             ~100ms   (CPU)
├── HTTP запрос к Gemini API        ~2000ms  (I/O)
├── Отправка TX в Solana            ~400ms   (I/O)
└── ИТОГО последовательно:          ~3700ms

РЕШЕНИЕ: asyncio + ThreadPoolExecutor + multiprocessing
├── Сбор данных: 4 запроса ПАРАЛЛЕЛЬНО         ~500ms  (asyncio.gather)
├── Мат + ML анализ: CPU-bound в ThreadPool    ~100ms  (run_in_executor)
├── Gemini API: async запрос                   ~2000ms (await)
├── Валидация: CPU-bound в ThreadPool          ~5ms    (run_in_executor)
├── Отправка TX: async                         ~400ms  (await)
└── ИТОГО с параллелизмом:                     ~3000ms

Для фонового мониторинга — multiprocessing:
├── Process 1: AI Agent (основной цикл каждые 10 мин)
├── Process 2: Health Monitor (проверка состояния пула)
└── Process 3: Price Watcher (алерты при резких движениях)
```

### 6.2 Структура проекта AI Agent

```
ai-agent/
├── main.py                        # точка входа, запуск процессов
├── agent/
│   ├── __init__.py
│   ├── orchestrator.py            # главный цикл (asyncio event loop)
│   ├── data_collector.py          # async сбор данных (aiohttp)
│   ├── quant_engine.py            # мат. анализ: RSI, MACD, Bollinger, ATR
│   ├── ml_engine.py               # ML модели: anomaly, trend, risk, volatility
│   ├── utilization_curve.py       # расчёт оптимальной ставки по формуле Aave
│   ├── signal_aggregator.py       # сборка QuantReport из всех сигналов
│   ├── ai_engine.py               # async Gemini API (интерпретация QuantReport)
│   ├── validator.py               # валидация решений AI
│   ├── tx_builder.py              # async построение и отправка TX
│   └── decision_logger.py         # логирование решений
├── models/
│   ├── __init__.py
│   ├── anomaly_detector.py        # IsolationForest — детекция аномалий рынка
│   ├── trend_predictor.py         # LinearRegression — прогноз тренда цены
│   ├── volatility_model.py        # EWMA/GARCH-lite — прогноз волатильности
│   ├── risk_scorer.py             # Композитный скоринг риска (0-100)
│   └── utilization_predictor.py   # Прогноз утилизации пула
├── workers/
│   ├── __init__.py
│   ├── health_monitor.py          # Process 2: мониторинг пула
│   └── price_watcher.py           # Process 3: отслеживание цен
├── config.py                      # настройки + Gemini API key
├── .env                           # GEMINI_API_KEY=AIzaSy...
└── requirements.txt
```

### 6.3 Конфигурация

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Gemini AI
    gemini_api_key: str                              # из .env
    gemini_model: str = "gemini-2.0-flash"

    # Solana Devnet
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_ws_url: str = "wss://api.devnet.solana.com"
    agent_keypair_path: str = "./keys/ai-agent.json"
    program_id: str = ""                             # после деплоя

    # Тайминги
    ai_cycle_interval: int = 600                     # 10 мин между циклами
    price_watch_interval: int = 30                   # проверка цен каждые 30 сек
    health_check_interval: int = 60                  # проверка пула каждую минуту

    # API endpoints
    coingecko_url: str = "https://api.coingecko.com/api/v3"
    jupiter_quote_url: str = "https://quote-api.jup.ag/v6"

    class Config:
        env_file = ".env"
```

### 6.4 Main — запуск процессов

```python
# main.py
import asyncio
import multiprocessing as mp
from agent.orchestrator import Orchestrator
from workers.health_monitor import HealthMonitor
from workers.price_watcher import PriceWatcher
from config import Settings

def run_orchestrator(settings: Settings):
    """Process 1: Основной AI-агент (asyncio event loop)"""
    orchestrator = Orchestrator(settings)
    asyncio.run(orchestrator.start())

def run_health_monitor(settings: Settings):
    """Process 2: Мониторинг здоровья пула"""
    monitor = HealthMonitor(settings)
    asyncio.run(monitor.start())

def run_price_watcher(settings: Settings):
    """Process 3: Отслеживание резких движений цен"""
    watcher = PriceWatcher(settings)
    asyncio.run(watcher.start())

if __name__ == "__main__":
    settings = Settings()

    # Общая очередь для коммуникации между процессами
    alert_queue = mp.Queue()

    processes = [
        mp.Process(target=run_orchestrator, args=(settings,), name="ai-orchestrator"),
        mp.Process(target=run_health_monitor, args=(settings,), name="health-monitor"),
        mp.Process(target=run_price_watcher, args=(settings,), name="price-watcher"),
    ]

    for p in processes:
        p.start()
        print(f"[STARTED] {p.name} (PID: {p.pid})")

    for p in processes:
        p.join()
```

### 6.5 Orchestrator — главный async цикл (ОБНОВЛЁННЫЙ с мат/ML)

```python
# agent/orchestrator.py — ОБНОВЛЁННЫЙ ПАЙПЛАЙН
import asyncio
from concurrent.futures import ThreadPoolExecutor
from agent.data_collector import DataCollector
from agent.quant_engine import QuantEngine
from agent.ml_engine import MLEngine
from agent.signal_aggregator import SignalAggregator
from agent.ai_engine import GeminiEngine
from agent.validator import Validator
from agent.tx_builder import TransactionBuilder
from agent.decision_logger import DecisionLogger

class Orchestrator:
    def __init__(self, settings):
        self.settings = settings
        self.collector = DataCollector(settings)
        self.quant = QuantEngine()                 # мат. индикаторы
        self.ml = MLEngine()                       # ML модели
        self.aggregator = SignalAggregator()        # сборка QuantReport
        self.ai = GeminiEngine(settings)            # Gemini интерпретатор
        self.validator = Validator(settings)
        self.tx_builder = TransactionBuilder(settings)
        self.logger = DecisionLogger(settings)
        self.executor = ThreadPoolExecutor(max_workers=4)

    async def run_cycle(self):
        """Один цикл AI-агента — 5 этапов"""

        # ═══════════════════════════════════════════════
        # ЭТАП 1: СБОР СЫРЫХ ДАННЫХ (async, параллельно)
        # ═══════════════════════════════════════════════
        market_data, pool_state, jupiter_data, price_history = await asyncio.gather(
            self.collector.fetch_sol_price(),
            self.collector.fetch_pool_state(),
            self.collector.fetch_jupiter_data(),
            self.collector.fetch_price_history(),   # массив цен за 24ч
            return_exceptions=True
        )

        # ═══════════════════════════════════════════════════════
        # ЭТАП 2: МАТ. АНАЛИЗ + ML (CPU-bound → ThreadPool)
        # Параллельно: тех. индикаторы + ML модели + кривая утилизации
        # ═══════════════════════════════════════════════════════
        loop = asyncio.get_event_loop()
        technical, ml_signals, util_recommendation = await asyncio.gather(
            loop.run_in_executor(self.executor, self.quant.analyze, price_history),
            loop.run_in_executor(self.executor, self.ml.predict, price_history, pool_state),
            loop.run_in_executor(self.executor, self.quant.utilization_curve, pool_state),
        )

        # Собрать все сигналы в единый QuantReport
        quant_report = self.aggregator.build_report(
            market_data=market_data,
            pool_state=pool_state,
            technical=technical,
            ml_signals=ml_signals,
            util_recommendation=util_recommendation,
        )

        # ═══════════════════════════════════════════════
        # ЭТАП 3: GEMINI ИНТЕРПРЕТАЦИЯ (async)
        # Получает QuantReport, НЕ сырые данные!
        # ═══════════════════════════════════════════════
        decision = await self.ai.interpret(quant_report)

        # ═══════════════════════════════════════════════
        # ЭТАП 4: ВАЛИДАЦИЯ (CPU-bound → ThreadPool)
        # ═══════════════════════════════════════════════
        is_valid, reason = await loop.run_in_executor(
            self.executor, self.validator.validate, decision, pool_state
        )
        if not is_valid:
            await self.logger.log_skip(decision, reason)
            return

        # ═══════════════════════════════════════════════
        # ЭТАП 5: ON-CHAIN TX + ЛОГИРОВАНИЕ (async, параллельно)
        # ═══════════════════════════════════════════════
        tx_hash = await self.tx_builder.send_update_parameters(decision)
        await asyncio.gather(
            self.logger.log_onchain(tx_hash, decision),
            self.logger.log_local(decision, quant_report),
        )
```

### 6.5.1 Quant Engine — математические индикаторы

```
quant_engine.py — чистая математика, никакого AI

ТЕХНИЧЕСКИЕ ИНДИКАТОРЫ (рассчитываются из массива цен):

┌─ RSI (Relative Strength Index, период 14) ──────────────────┐
│ Формула:                                                      │
│   avg_gain = среднее положительных изменений за 14 периодов   │
│   avg_loss = среднее отрицательных изменений за 14 периодов   │
│   RS = avg_gain / avg_loss                                    │
│   RSI = 100 - (100 / (1 + RS))                               │
│                                                                │
│ Интерпретация:                                                │
│   RSI > 70 → перекуплен (риск падения, повышаем залог)        │
│   RSI < 30 → перепродан (потенциал роста, можно снизить залог)│
│   30-70 → нейтрально                                         │
└───────────────────────────────────────────────────────────────┘

┌─ MACD (Moving Average Convergence Divergence) ───────────────┐
│ Формула:                                                      │
│   EMA_12 = экспоненциальная скользящая средняя (12 периодов)  │
│   EMA_26 = экспоненциальная скользящая средняя (26 периодов)  │
│   MACD_line = EMA_12 - EMA_26                                 │
│   Signal_line = EMA(MACD_line, 9)                             │
│   Histogram = MACD_line - Signal_line                         │
│                                                                │
│ Сигналы:                                                      │
│   MACD > Signal → бычий (bullish) → можно снижать ставку      │
│   MACD < Signal → медвежий (bearish) → повышаем ставку/залог  │
│   Histogram растёт → тренд усиливается                        │
└───────────────────────────────────────────────────────────────┘

┌─ Bollinger Bands (период 20, отклонение 2σ) ─────────────────┐
│ Формула:                                                      │
│   Middle = SMA(20)  (простая скользящая средняя)              │
│   Upper = Middle + 2 * StdDev(20)                             │
│   Lower = Middle - 2 * StdDev(20)                             │
│   %B = (Price - Lower) / (Upper - Lower)                     │
│   Bandwidth = (Upper - Lower) / Middle                        │
│                                                                │
│ Сигналы:                                                      │
│   %B > 1 → цена выше верхней полосы (перегрев)               │
│   %B < 0 → цена ниже нижней полосы (провал)                  │
│   Bandwidth сужается → готовится резкое движение              │
└───────────────────────────────────────────────────────────────┘

┌─ ATR (Average True Range, период 14) ────────────────────────┐
│ Формула:                                                      │
│   TR = max(High-Low, |High-PrevClose|, |Low-PrevClose|)      │
│   ATR = SMA(TR, 14)                                           │
│                                                                │
│ Использование:                                                │
│   ATR высокий → высокая волатильность → повышаем залог        │
│   ATR низкий → стабильный рынок → можно снизить залог         │
└───────────────────────────────────────────────────────────────┘

┌─ EMA Crossover (9/21) ───────────────────────────────────────┐
│   EMA_9 > EMA_21 → краткосрочный бычий тренд                 │
│   EMA_9 < EMA_21 → краткосрочный медвежий тренд              │
│   Пересечение → смена тренда                                  │
└───────────────────────────────────────────────────────────────┘

РЕЗУЛЬТАТ QuantEngine.analyze() → TechnicalSignals:
{
  "rsi": 72.3,
  "rsi_signal": "overbought",
  "macd_line": 0.45,
  "macd_signal_line": 0.32,
  "macd_histogram": 0.13,
  "macd_trend": "bullish",
  "bollinger_percent_b": 0.85,
  "bollinger_bandwidth": 0.12,
  "atr": 4.2,
  "atr_percentile": 65,          # ATR vs история — какой процентиль
  "ema_crossover": "bullish",
  "trend_strength": 0.7           # 0-1, сила тренда
}
```

### 6.5.2 Utilization Curve — формула расчёта ставки

```
utilization_curve.py — формула оптимальной ставки (как в Aave/Compound)

Формула кривой утилизации:

  U = total_borrows / total_deposits          # коэффициент утилизации
  U_optimal = 0.80                            # оптимальная утилизация (80%)

  ЕСЛИ U ≤ U_optimal:
    R = R_base + (U / U_optimal) * R_slope1
    R = 1% + (U / 0.80) * 4%

    Пример: U=60% → R = 1% + (0.6/0.8) * 4% = 4.0%

  ЕСЛИ U > U_optimal:
    R = R_base + R_slope1 + ((U - U_optimal) / (1 - U_optimal)) * R_slope2
    R = 1% + 4% + ((U - 0.80) / 0.20) * 15%

    Пример: U=90% → R = 5% + (0.10/0.20) * 15% = 12.5%
    Пример: U=95% → R = 5% + (0.15/0.20) * 15% = 16.25%

  Кривая (визуально):

  Rate%
  20% ┤                                          ╱
  15% ┤                                       ╱╱╱
  10% ┤                                    ╱╱╱
   5% ┤────────────────────────────────╱╱╱
   1% ┤╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱
      └──┬────┬────┬────┬────┬────┬──
        0%  20%  40%  60%  80% 100%  ← Utilization
                              ▲
                         U_optimal

  Смысл: Когда пул почти пуст (высокая утилизация) — ставка
  резко растёт, чтобы привлечь лендеров и отпугнуть заёмщиков.
  Это МАТЕМАТИКА, не мнение AI.

РЕЗУЛЬТАТ utilization_curve() → UtilRecommendation:
{
  "utilization": 0.60,
  "optimal_rate_bps": 400,         # 4.0% — рассчитано по формуле
  "rate_range_bps": [350, 450],    # допустимый диапазон ±0.5%
  "zone": "normal",                # normal / warning / critical
  "pressure": "neutral"            # deposit_needed / borrow_limited / neutral
}
```

### 6.5.3 ML Engine — модели машинного обучения

```
ml_engine.py — sklearn модели, обучаются на исторических данных

Библиотеки: numpy, pandas, scikit-learn

┌─ 1. Anomaly Detector (IsolationForest) ──────────────────────┐
│                                                                │
│ Задача: Определить, является ли текущее состояние рынка        │
│         аномальным (необычным)                                 │
│                                                                │
│ Входные фичи:                                                  │
│   - price_change_1h, price_change_24h                          │
│   - volume_change_24h                                          │
│   - volatility (ATR)                                           │
│   - utilization                                                │
│                                                                │
│ Обучение: на истории цен SOL за последние 30 дней              │
│ (фит при каждом запуске агента, ~1000 точек)                   │
│                                                                │
│ Выход: anomaly_score (-1..1)                                   │
│   score > 0 → нормальное состояние                             │
│   score < 0 → аномалия → ПОВЫШЕННАЯ ОСТОРОЖНОСТЬ              │
│   score < -0.5 → сильная аномалия → минимальные лимиты        │
└───────────────────────────────────────────────────────────────┘

┌─ 2. Trend Predictor (LinearRegression + feature engineering) ─┐
│                                                                │
│ Задача: Предсказать направление цены на следующие 1-4 часа     │
│                                                                │
│ Фичи:                                                          │
│   - lag_1h, lag_2h, lag_4h, lag_8h (лаговые значения цены)    │
│   - rsi, macd_histogram                                        │
│   - volume_ratio (текущий объём / средний)                     │
│   - hour_of_day (циклический — sin/cos кодирование)           │
│                                                                │
│ Выход: predicted_change_percent, prediction_confidence         │
│   +2.5% с confidence 0.7 → цена скорее вырастет               │
│   -1.3% с confidence 0.4 → слабый сигнал, не учитываем        │
└───────────────────────────────────────────────────────────────┘

┌─ 3. Volatility Model (EWMA — Exponentially Weighted) ────────┐
│                                                                │
│ Задача: Спрогнозировать волатильность на ближайшие часы        │
│                                                                │
│ Формула (EWMA, как в RiskMetrics):                             │
│   σ²(t) = λ * σ²(t-1) + (1-λ) * r²(t-1)                     │
│   λ = 0.94 (стандарт RiskMetrics)                              │
│   r(t) = log(price(t) / price(t-1))                           │
│                                                                │
│ Выход: predicted_volatility, volatility_regime                 │
│   regime: "low" (<2%) / "medium" (2-5%) / "high" (>5%)       │
│                                                                │
│ Применение:                                                    │
│   high → повысить collateral_ratio (больше залога)             │
│   low → можно снизить collateral_ratio                         │
└───────────────────────────────────────────────────────────────┘

┌─ 4. Risk Scorer (композитная модель) ────────────────────────┐
│                                                                │
│ Задача: Единый скоринг риска от 0 до 100                       │
│                                                                │
│ Формула (взвешенная сумма):                                    │
│   risk = w1 * volatility_score                                 │
│        + w2 * trend_risk_score                                  │
│        + w3 * utilization_risk_score                           │
│        + w4 * anomaly_risk_score                               │
│        + w5 * liquidity_risk_score                             │
│                                                                │
│ Веса (по умолчанию):                                           │
│   w1=0.25 (волатильность)                                      │
│   w2=0.20 (тренд — падающий тренд = больше риска)             │
│   w3=0.25 (утилизация — высокая = больше риска)               │
│   w4=0.15 (аномалии)                                           │
│   w5=0.15 (ликвидность — низкая = больше риска)               │
│                                                                │
│ Выход: risk_score (0-100), risk_level (low/medium/high/critical)│
│   0-25: low        → агрессивные параметры (низкая ставка)     │
│   25-50: medium    → нейтральные параметры                     │
│   50-75: high      → консервативные (высокая ставка/залог)     │
│   75-100: critical → минимальные лимиты, максимальный залог    │
└───────────────────────────────────────────────────────────────┘

┌─ 5. Utilization Predictor (LinearRegression) ────────────────┐
│                                                                │
│ Задача: Предсказать утилизацию пула через 1-4 часа             │
│                                                                │
│ Фичи: текущая утилизация, тренд за 24ч, рыночный тренд,       │
│        час дня, день недели                                     │
│                                                                │
│ Выход: predicted_utilization                                   │
│   Если растёт → заранее повышаем ставку (привлекаем лендеров) │
│   Если падает → можно снизить ставку                           │
└───────────────────────────────────────────────────────────────┘

РЕЗУЛЬТАТ MLEngine.predict() → MLSignals:
{
  "anomaly_score": 0.3,
  "is_anomaly": false,
  "trend_prediction": +2.1,
  "trend_confidence": 0.68,
  "predicted_volatility": 3.8,
  "volatility_regime": "medium",
  "risk_score": 45,
  "risk_level": "medium",
  "predicted_utilization": 0.65,
  "utilization_trend": "rising"
}
```

### 6.5.4 Signal Aggregator — сборка QuantReport

```
signal_aggregator.py — объединяет ВСЕ сигналы в один отчёт

QuantReport = {
  # Сырые рыночные данные
  "sol_price": 185.40,
  "sol_24h_change": -3.2,

  # Состояние пула
  "pool_utilization": 0.60,
  "total_deposits": 50000,
  "total_borrows": 30000,
  "current_rate_bps": 500,
  "current_collateral_bps": 15000,

  # Технические индикаторы (из QuantEngine)
  "rsi": 72.3,
  "rsi_signal": "overbought",
  "macd_trend": "bullish",
  "macd_histogram": 0.13,
  "bollinger_percent_b": 0.85,
  "atr_percentile": 65,
  "ema_crossover": "bullish",

  # ML сигналы (из MLEngine)
  "anomaly_score": 0.3,
  "is_anomaly": false,
  "trend_prediction": +2.1,
  "trend_confidence": 0.68,
  "volatility_regime": "medium",
  "risk_score": 45,
  "risk_level": "medium",
  "predicted_utilization": 0.65,

  # Рекомендация кривой утилизации (математическая)
  "formula_optimal_rate_bps": 400,
  "formula_rate_range_bps": [350, 450],
  "utilization_zone": "normal",

  # Агрегированные рекомендации (из математики)
  "recommended_rate_direction": "increase",    # increase/decrease/hold
  "recommended_collateral_direction": "increase",
  "math_confidence": 0.75,                      # уверенность на основе совпадения сигналов

  # Жёсткие ограничения контракта
  "constraints": {
    "min_rate_bps": 100,
    "max_rate_bps": 2000,
    "min_collateral_bps": 12000,
    "max_collateral_bps": 20000,
    "max_change_percent": 20
  }
}

ЛОГИКА recommended_rate_direction:
  Считаем "голоса" индикаторов:

  Голос за ПОВЫШЕНИЕ ставки:
    + RSI > 70 (перекуплен → скоро коррекция → больше риск → выше ставка)
    + volatility_regime == "high"
    + risk_score > 50
    + utilization > 0.75
    + anomaly detected

  Голос за ПОНИЖЕНИЕ ставки:
    + RSI < 40 (недооценён)
    + volatility_regime == "low"
    + risk_score < 25
    + utilization < 0.50
    + trend_prediction > +3% с confidence > 0.6

  math_confidence = |голоса_за - голоса_против| / total_голосов
  Чем больше согласие между индикаторами — тем выше уверенность.
```

### 6.5.5 Что получает Gemini (НОВЫЙ промпт)

```
СТАРЫЙ промпт (плохо):
  "Вот цена SOL $185, что делать со ставкой?"
  → Gemini угадывает

НОВЫЙ промпт (правильно):
  "Вот результаты мат. анализа и ML моделей:
   - RSI=72 (перекуплен)
   - MACD: бычий тренд, но ослабевает
   - Формула утилизации рекомендует: 4.0% (сейчас 5.0%)
   - ML risk score: 45/100 (medium)
   - Волатильность: medium, прогноз — рост
   - Аномалий не обнаружено
   - 4 из 6 индикаторов рекомендуют: повысить ставку

   Выбери ФИНАЛЬНЫЕ параметры в рамках рекомендаций математики.
   Объясни почему выбрал именно эти значения."
  → Gemini интерпретирует готовые числа

Gemini НЕ СЧИТАЕТ. Gemini ВЫБИРАЕТ из диапазона,
который уже рассчитала математика.
```

### 6.6 Data Collector — async параллельный сбор

```python
# agent/data_collector.py
import aiohttp

class DataCollector:
    def __init__(self, settings):
        self.settings = settings
        self.session = None

    async def _get_session(self):
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session

    async def fetch_sol_price(self) -> dict:
        """CoinGecko: цена SOL, изменение 24ч, объёмы"""
        session = await self._get_session()
        url = f"{self.settings.coingecko_url}/simple/price"
        params = {
            "ids": "solana",
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true"
        }
        async with session.get(url, params=params) as resp:
            data = await resp.json()
            return {
                "sol_price": data["solana"]["usd"],
                "sol_24h_change": data["solana"]["usd_24h_change"],
                "sol_24h_volume": data["solana"]["usd_24h_vol"],
            }

    async def fetch_pool_state(self) -> dict:
        """Solana RPC: текущее состояние нашего пула"""
        # Читаем аккаунт LendingPool из devnet через anchor
        from solana.rpc.async_api import AsyncClient
        client = AsyncClient(self.settings.solana_rpc_url)
        # ... десериализация аккаунта через Anchor IDL
        return {
            "total_deposits": 50000,
            "total_borrows": 30000,
            "utilization": 0.6,
            "current_rate_bps": 500,
            "current_collateral_bps": 15000,
        }

    async def fetch_jupiter_data(self) -> dict:
        """Jupiter: ликвидность и объёмы"""
        session = await self._get_session()
        url = f"{self.settings.jupiter_quote_url}/quote"
        params = {"inputMint": "SOL_MINT", "outputMint": "USDC_MINT", "amount": "1000000000"}
        async with session.get(url, params=params) as resp:
            data = await resp.json()
            return {"best_route_slippage": data.get("slippageBps", 0)}

    async def fetch_price_history(self) -> dict:
        """CoinGecko: история цен для расчёта волатильности"""
        session = await self._get_session()
        url = f"{self.settings.coingecko_url}/coins/solana/market_chart"
        params = {"vs_currency": "usd", "days": "1"}
        async with session.get(url, params=params) as resp:
            data = await resp.json()
            prices = [p[1] for p in data.get("prices", [])]
            if len(prices) > 1:
                volatility = (max(prices) - min(prices)) / min(prices) * 100
            else:
                volatility = 0
            return {"volatility_24h": round(volatility, 2)}

    def build_context(self, market_data, pool_state, jupiter_data, price_history) -> dict:
        """Собрать все данные в единый контекст для AI"""
        return {
            "pool_state": pool_state,
            "market_data": {**market_data, **price_history},
            "liquidity": jupiter_data,
            "constraints": {
                "min_rate_bps": 100,
                "max_rate_bps": 2000,
                "min_collateral_bps": 12000,
                "max_collateral_bps": 20000,
                "max_change_percent": 20,
            }
        }
```

### 6.7 Gemini AI Engine — ИНТЕРПРЕТАТОР (не решатель)

```
РОЛЬ GEMINI ИЗМЕНИЛАСЬ:

Раньше: Gemini = мозг, принимает решения
Теперь: Gemini = интерпретатор, выбирает из рекомендаций математики

Gemini получает QuantReport где ВСЕ числа уже рассчитаны.
Его задача:
  1. Прочитать сигналы (RSI, MACD, ML risk, формулу ставки)
  2. Учесть контекст (какие сигналы противоречат друг другу)
  3. Выбрать ФИНАЛЬНЫЕ параметры в рамках рекомендованного диапазона
  4. Объяснить логику выбора на человеческом языке

ПРОМПТ для Gemini (новый):

  "Ты — интерпретатор количественного анализа DeFi лендинг протокола.
   Ты НЕ считаешь — все числа уже рассчитаны. Ты ВЫБИРАЕШЬ параметры.

   === РЕЗУЛЬТАТЫ МАТЕМАТИЧЕСКОГО АНАЛИЗА ===

   Технические индикаторы:
   - RSI: {rsi} ({rsi_signal})
   - MACD тренд: {macd_trend}, гистограмма: {macd_histogram}
   - Bollinger %B: {bollinger_percent_b}
   - ATR перцентиль: {atr_percentile}%
   - EMA crossover: {ema_crossover}

   ML модели:
   - Anomaly score: {anomaly_score} (аномалия: {is_anomaly})
   - Прогноз тренда: {trend_prediction}% (confidence: {trend_confidence})
   - Режим волатильности: {volatility_regime}
   - Risk score: {risk_score}/100 ({risk_level})
   - Прогноз утилизации: {predicted_utilization}

   Формула кривой утилизации:
   - Оптимальная ставка по формуле: {formula_optimal_rate_bps/100}%
   - Допустимый диапазон: {rate_range}%
   - Зона утилизации: {utilization_zone}

   Агрегированная рекомендация:
   - Направление ставки: {recommended_rate_direction}
   - Направление залога: {recommended_collateral_direction}
   - Согласованность сигналов: {math_confidence}

   Текущие параметры: ставка {current_rate}%, залог {current_collateral}%
   Ограничения: ставка [{min_rate}-{max_rate}%], залог [{min_col}-{max_col}%]

   ЗАДАЧА: Выбери финальные параметры. Ставка должна быть БЛИЗКА
   к формульной рекомендации ({formula_optimal_rate}%), отклонение
   допустимо если ML сигналы указывают на повышенный риск.

   Ответь JSON:
   {{
     interest_rate_bps: число,
     collateral_ratio_bps: число,
     max_borrow_limit: число,
     reasoning: 'почему эти числа — со ссылками на конкретные индикаторы',
     confidence: число (0-100),
     risk_assessment: 'low/medium/high'
   }}"

ПРИМЕР ОТВЕТА GEMINI:
{
  "interest_rate_bps": 480,
  "collateral_ratio_bps": 15500,
  "max_borrow_limit": 4500,
  "reasoning": "Формула рекомендует 4.0%, но RSI=72 (перекуплен) и
    ML risk_score=45 указывают на повышенный риск коррекции.
    Повышаю ставку до 4.8% (+0.8% от формулы) как буфер.
    Залог повышаю с 150% до 155% из-за medium волатильности
    и прогноза роста волатильности. MACD бычий, но ослабевает —
    не агрессивничаю.",
  "confidence": 78,
  "risk_assessment": "medium"
}

КЛЮЧЕВОЕ ОТЛИЧИЕ:
├── Каждое число в reasoning ссылается на конкретный индикатор
├── Ставка БЛИЗКА к формульной, не взята с потолка
├── Отклонения от формулы ОБОСНОВАНЫ конкретными ML сигналами
└── Gemini не угадывает — он синтезирует количественные данные
```

### 6.8 Validator — CPU-bound в ThreadPool

```python
# agent/validator.py

class Validator:
    def validate(self, decision: dict, pool_state: dict) -> tuple[bool, str]:
        """Проверка решения AI ПЕРЕД отправкой в блокчейн.
           Выполняется в ThreadPoolExecutor (CPU-bound)."""

        # 1. JSON структура корректна?
        required = ["interest_rate_bps", "collateral_ratio_bps",
                     "max_borrow_limit", "confidence", "risk_assessment"]
        for field in required:
            if field not in decision:
                return False, f"Missing field: {field}"

        rate = decision["interest_rate_bps"]
        collateral = decision["collateral_ratio_bps"]
        confidence = decision["confidence"]
        risk = decision["risk_assessment"]

        # 2. Ставка в рамках [100, 2000] bps (1%-20%)?
        if not (100 <= rate <= 2000):
            return False, f"Rate {rate} out of bounds [100, 2000]"

        # 3. Залог в рамках [12000, 20000] bps (120%-200%)?
        if not (12000 <= collateral <= 20000):
            return False, f"Collateral {collateral} out of bounds [12000, 20000]"

        # 4. Изменение не больше 20%?
        current_rate = pool_state["current_rate_bps"]
        if current_rate > 0:
            change = abs(rate - current_rate) / current_rate
            if change > 0.20:
                return False, f"Rate change {change:.0%} exceeds 20%"

        # 5. Confidence > 50?
        if confidence < 50:
            return False, f"Confidence {confidence} too low (min 50)"

        # 6. Risk не critical?
        if risk == "critical":
            return False, "Risk assessment is critical, skipping"

        return True, "OK"
```

### 6.9 Transaction Builder — async отправка в Solana

```python
# agent/tx_builder.py
import hashlib
from solana.rpc.async_api import AsyncClient
from solana.transaction import Transaction
from solders.keypair import Keypair
from anchorpy import Program, Provider

class TransactionBuilder:
    def __init__(self, settings):
        self.settings = settings
        self.client = AsyncClient(settings.solana_rpc_url)
        self.keypair = Keypair.from_json(settings.agent_keypair_path)

    async def send_update_parameters(self, decision: dict) -> str:
        """Построить и отправить TX update_parameters в devnet"""

        reasoning_hash = hashlib.sha256(
            decision["reasoning"].encode()
        ).digest()

        # Вызов через Anchor
        # program.rpc.update_parameters(
        #     decision["interest_rate_bps"],
        #     decision["collateral_ratio_bps"],
        #     decision["max_borrow_limit"],
        #     list(reasoning_hash),
        #     decision["confidence"],
        #     ctx=Context(accounts={...}, signers=[self.keypair])
        # )

        # Возвращаем TX hash
        return "mock_tx_hash"  # заменим на реальный после деплоя
```

### 6.10 Workers — отдельные процессы

```python
# workers/price_watcher.py
import asyncio
import aiohttp

class PriceWatcher:
    """Process 3: Следит за ценой SOL каждые 30 секунд.
       При резком движении (>5% за 5 мин) — будит Orchestrator досрочно."""

    def __init__(self, settings):
        self.settings = settings
        self.price_history = []

    async def start(self):
        print("[PRICE WATCHER] Started")
        while True:
            try:
                price = await self.fetch_price()
                self.price_history.append(price)

                # Хранить только последние 10 точек (5 мин)
                if len(self.price_history) > 10:
                    self.price_history.pop(0)

                # Проверка резкого движения
                if len(self.price_history) >= 2:
                    oldest = self.price_history[0]
                    change = abs(price - oldest) / oldest * 100
                    if change > 5.0:
                        print(f"[ALERT] Price moved {change:.1f}% in 5 min!")
                        # TODO: отправить сигнал в Orchestrator через Queue

            except Exception as e:
                print(f"[PRICE WATCHER ERROR] {e}")

            await asyncio.sleep(self.settings.price_watch_interval)

    async def fetch_price(self) -> float:
        async with aiohttp.ClientSession() as session:
            url = "https://api.coingecko.com/api/v3/simple/price"
            params = {"ids": "solana", "vs_currencies": "usd"}
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                return data["solana"]["usd"]
```

```python
# workers/health_monitor.py
import asyncio

class HealthMonitor:
    """Process 2: Проверяет здоровье пула каждую минуту.
       Алерт если: утилизация > 90%, ликвидность критически низкая."""

    def __init__(self, settings):
        self.settings = settings

    async def start(self):
        print("[HEALTH MONITOR] Started")
        while True:
            try:
                await self.check_pool_health()
            except Exception as e:
                print(f"[HEALTH MONITOR ERROR] {e}")
            await asyncio.sleep(self.settings.health_check_interval)

    async def check_pool_health(self):
        # TODO: читать состояние пула из Solana devnet
        # Алерты:
        # - utilization > 90% → WARN
        # - available_liquidity < 1000 → CRITICAL
        # - AI не обновлял параметры > 1 hour → STALE
        pass
```

### 6.11 Полная диаграмма потоков (с Math + ML)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       MULTIPROCESSING                                 │
│                                                                       │
│  ┌─ Process 1: ORCHESTRATOR (asyncio event loop) ─────────────────┐  │
│  │                                                                 │  │
│  │   ┌──── ЭТАП 1: СБОР ДАННЫХ (asyncio.gather) ──────────────┐  │  │
│  │   │  fetch_sol_price()  ──► aiohttp ──► CoinGecko           │  │  │
│  │   │  fetch_pool_state() ──► solana.rpc ──► Devnet RPC       │  │  │
│  │   │  fetch_jupiter()    ──► aiohttp ──► Jupiter API         │  │  │
│  │   │  fetch_history()    ──► aiohttp ──► CoinGecko (24h)     │  │  │
│  │   └──────────────────────┬──────────────────────────────────┘  │  │
│  │                          ▼                                     │  │
│  │   ┌──── ЭТАП 2: MATH + ML (ThreadPool, параллельно) ───────┐  │  │
│  │   │                                                          │  │  │
│  │   │  ┌─ Thread 1 ────────────────────────────────────┐      │  │  │
│  │   │  │ QuantEngine.analyze(prices)                    │      │  │  │
│  │   │  │ → RSI, MACD, Bollinger, ATR, EMA crossover    │      │  │  │
│  │   │  └────────────────────────────────────────────────┘      │  │  │
│  │   │                                                          │  │  │
│  │   │  ┌─ Thread 2 ────────────────────────────────────┐      │  │  │
│  │   │  │ MLEngine.predict(prices, pool_state)           │      │  │  │
│  │   │  │ → IsolationForest, LinearRegression, EWMA,     │      │  │  │
│  │   │  │   RiskScorer, UtilizationPredictor             │      │  │  │
│  │   │  └────────────────────────────────────────────────┘      │  │  │
│  │   │                                                          │  │  │
│  │   │  ┌─ Thread 3 ────────────────────────────────────┐      │  │  │
│  │   │  │ QuantEngine.utilization_curve(pool_state)      │      │  │  │
│  │   │  │ → формула Aave: оптимальная ставка             │      │  │  │
│  │   │  └────────────────────────────────────────────────┘      │  │  │
│  │   │                                                          │  │  │
│  │   └──────────────────────┬───────────────────────────────┘   │  │
│  │                          ▼                                     │  │
│  │              SignalAggregator.build_report()                    │  │
│  │              → QuantReport (все числа + рекомендации)           │  │
│  │                          │                                     │  │
│  │                          ▼                                     │  │
│  │   ┌──── ЭТАП 3: GEMINI ИНТЕРПРЕТАЦИЯ (async) ──────────────┐  │  │
│  │   │  GeminiEngine.interpret(quant_report)                    │  │  │
│  │   │  → Gemini читает мат. отчёт                              │  │  │
│  │   │  → Выбирает параметры из рекомендованного диапазона      │  │  │
│  │   │  → Объясняет со ссылками на индикаторы                   │  │  │
│  │   └──────────────────────┬───────────────────────────────────┘  │  │
│  │                          ▼                                     │  │
│  │   ┌──── ЭТАП 4: ВАЛИДАЦИЯ (ThreadPool) ────────────────────┐  │  │
│  │   │  Validator.validate(decision, pool_state)               │  │  │
│  │   │  → проверка лимитов, cooldown, макс. изменение          │  │  │
│  │   └──────────────────────┬──────────────────────────────────┘  │  │
│  │                          ▼                                     │  │
│  │   ┌──── ЭТАП 5: ON-CHAIN TX (async) ───────────────────────┐  │  │
│  │   │  tx_builder.send_update_parameters(decision)             │  │  │
│  │   │  → Solana devnet → контракт проверяет → обновляет        │  │  │
│  │   └──────────────────────┬──────────────────────────────────┘  │  │
│  │                          ▼                                     │  │
│  │   ┌──── ЭТАП 6: ЛОГИРОВАНИЕ (asyncio.gather) ──────────────┐  │  │
│  │   │  log_onchain(tx_hash, decision)  ← параллельно          │  │  │
│  │   │  log_local(decision, quant_report) ← параллельно        │  │  │
│  │   └─────────────────────────────────────────────────────────┘  │  │
│  │                                                                 │  │
│  │   sleep(600) ──► повторить цикл                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Process 2: HEALTH MONITOR (asyncio) ──────────────────────────┐  │
│  │  loop: check_pool_health() → sleep(60) → repeat                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Process 3: PRICE WATCHER (asyncio) ───────────────────────────┐  │
│  │  loop: fetch_price() → detect_spike() → alert_queue → repeat   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  mp.Queue() ◄── межпроцессная коммуникация (алерты → досрочный цикл) │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.12 Зависимости AI Agent (requirements.txt)

```
# Async I/O
aiohttp>=3.9
asyncio

# Solana
solana>=0.34
solders>=0.21
anchorpy>=0.20

# AI
google-generativeai>=0.8

# Math + ML
numpy>=1.26
pandas>=2.2
scikit-learn>=1.4

# Config
pydantic-settings>=2.0
python-dotenv>=1.0

# Logging
structlog>=24.0
```

---

## 7. Frontend (React + Vite) — Adaptive Desktop + Mobile

### 7.1 Технологии

```
React 18 + Vite          — SPA фреймворк + быстрый бандлер
TypeScript               — типизация
@solana/web3.js          — подключение к Solana devnet
@solana/wallet-adapter-react — Phantom, Solflare
@coral-xyz/anchor        — вызов функций контракта (deposit/borrow/repay — TX)
TailwindCSS              — стили + адаптивная сетка (sm/md/lg/xl breakpoints)
Recharts                 — графики (ResponsiveContainer для адаптивности)
React Router             — навигация
@headlessui/react        — мобильное меню, модалки, drawer

ВАЖНО: Frontend НЕ читает данные напрямую из Solana RPC.
- Чтение данных (пул, решения AI, история) → через FastAPI REST API
- Реальное время (обновления пула, новые решения AI) → через FastAPI WebSocket
- Подпись транзакций (deposit, borrow, repay) → напрямую через Phantom → Solana

АДАПТИВНОСТЬ (mobile-first):
- Breakpoints: sm(640px) md(768px) lg(1024px) xl(1280px)
- Mobile: single column, bottom nav, drawer menu, touch-friendly buttons
- Tablet: 2-column grid, sidebar collapse
- Desktop: full layout, sidebar, 4-column stats grid
- Графики: ResponsiveContainer (100% width, динамическая высота)
- Кошелёк: Phantom Mobile поддерживает deeplink на мобильных
```

### 7.2 Страницы

```
/                    → Landing page (что это, как работает)
/dashboard           → Главный дашборд
/deposit             → Дать в займ aiUSDC (лендер)
/borrow              → Взять займ (заёмщик)
/ai-decisions        → Лог всех решений AI
/analytics           → Графики параметров во времени
```

### 7.3 Адаптивная сетка (Tailwind breakpoints)

```
DESKTOP (lg+, ≥1024px):
┌──────────────────────────────────────────────────────────┐
│  Navbar: Logo ─── Dashboard │ Deposit │ Borrow │ AI Log  │  [Wallet]
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  ← grid-cols-4
│  │Total Pool│ │ Borrows  │ │   Rate   │ │Collateral│   │
│  │50K aiUSDC│ │30K aiUSDC│ │  6.5%    │ │  155%    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│  ┌── AI Decision (2/3 width) ──┐ ┌─ Mood+Stats (1/3) ─┐│  ← grid-cols-3
│  │ "Повысил ставку с 5%→6.5%  │ │ Mood: Thriving      ││
│  │  RSI=72, утилизация 60%"   │ │ Updates: 147        ││
│  │  Confidence: 87% │ TX: ... │ │ Uptime: 5d 3h       ││
│  └─────────────────────────────┘ └─────────────────────┘│
│                                                          │
│  ┌── Rate Chart (full width) ────────────────────────┐  │  ← col-span-full
│  │  7% ┤          ╭──                                │  │
│  │  5% ┤─────╯                                       │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌── Deposit ──────────┐ ┌── Borrow ─────────────────┐  │  ← grid-cols-2
│  │ [Deposit aiUSDC]    │ │ [Borrow aiUSDC]           │  │
│  └─────────────────────┘ └───────────────────────────┘  │
└──────────────────────────────────────────────────────────┘


TABLET (md, 768-1023px):
┌────────────────────────────────┐
│  Navbar: Logo ── [≡ Menu]  [Wallet]
├────────────────────────────────┤
│                                │
│  ┌──────────┐ ┌──────────┐   │  ← grid-cols-2
│  │Total Pool│ │ Borrows  │   │
│  └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐   │
│  │   Rate   │ │Collateral│   │
│  └──────────┘ └──────────┘   │
│                                │
│  ┌── AI Decision ──────────┐  │  ← full width
│  │ Mood: Thriving          │  │
│  │ "Повысил ставку..."     │  │
│  └─────────────────────────┘  │
│                                │
│  ┌── Chart ────────────────┐  │
│  │  (ResponsiveContainer)  │  │
│  └─────────────────────────┘  │
│                                │
│  [Deposit]     [Borrow]       │  ← grid-cols-2
└────────────────────────────────┘


MOBILE (sm, <768px):
┌────────────────────┐
│ Logo      [Wallet] │
├────────────────────┤
│                    │
│ ┌────────────────┐ │  ← grid-cols-1, всё в столбик
│ │ Total Pool     │ │
│ │ 50K aiUSDC     │ │
│ └────────────────┘ │
│ ┌────────────────┐ │
│ │ Rate: 6.5%     │ │
│ │ Collateral:155%│ │
│ └────────────────┘ │
│                    │
│ Mood: 🟢 Thriving  │
│                    │
│ ┌─ AI Decision ──┐ │
│ │ "Повысил ставку│ │
│ │  с 5% до 6.5%" │ │
│ │ Confidence: 87%│ │
│ └────────────────┘ │
│                    │
│ ┌─ Chart ────────┐ │  ← height: 200px на мобиле
│ │ (compact)      │ │
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │  ← full-width кнопки
│ │   [Deposit]    │ │
│ └────────────────┘ │
│ ┌────────────────┐ │
│ │   [Borrow]     │ │
│ └────────────────┘ │
│                    │
├────────────────────┤
│ 🏠  📊  💰  🤖   │  ← Bottom Navigation (mobile only)
│Home Dash Dep. AI  │
└────────────────────┘
```

### 7.4 Адаптивные компоненты (Tailwind классы)

```tsx
// Navbar — скрываем пункты на мобиле, показываем бургер
<nav className="flex items-center justify-between px-4 py-3 lg:px-8">
  <Logo />
  {/* Desktop menu */}
  <div className="hidden md:flex gap-6">
    <NavLink to="/dashboard">Dashboard</NavLink>
    <NavLink to="/deposit">Deposit</NavLink>
    <NavLink to="/borrow">Borrow</NavLink>
    <NavLink to="/ai-decisions">AI Log</NavLink>
  </div>
  {/* Mobile burger */}
  <button className="md:hidden" onClick={toggleMenu}>☰</button>
  <WalletButton />
</nav>

// Stats Grid — 1 col mobile, 2 col tablet, 4 col desktop
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
  <StatCard title="Total Pool" value="50K aiUSDC" />
  <StatCard title="Borrows" value="30K aiUSDC" />
  <StatCard title="Rate" value="6.5%" change="+1.5%" />
  <StatCard title="Collateral" value="155%" change="+5%" />
</div>

// Chart — адаптивная высота
<div className="w-full h-[200px] sm:h-[250px] lg:h-[350px]">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={rateHistory}>...</LineChart>
  </ResponsiveContainer>
</div>

// Buttons — full width на мобиле, inline на десктопе
<div className="flex flex-col sm:flex-row gap-3 p-4">
  <button className="w-full sm:w-auto px-6 py-3 min-h-[48px] ...">
    Deposit aiUSDC
  </button>
  <button className="w-full sm:w-auto px-6 py-3 min-h-[48px] ...">
    Borrow aiUSDC
  </button>
</div>

// AI Decision Card — компактнее на мобиле
<div className="p-3 sm:p-4 lg:p-6 rounded-xl bg-gray-800">
  <div className="flex flex-col sm:flex-row sm:justify-between mb-2">
    <MoodBadge mood="thriving" />
    <span className="text-xs text-gray-400 mt-1 sm:mt-0">3 min ago</span>
  </div>
  <p className="text-sm sm:text-base">{reasoning}</p>
  <div className="flex flex-wrap gap-2 mt-2 text-xs">
    <Badge>Confidence: 87%</Badge>
    <Badge>Risk: Medium</Badge>
    <Badge>TX: 5xK9f...</Badge>
  </div>
</div>

// Bottom Navigation — только на мобиле
<nav className="fixed bottom-0 left-0 right-0 md:hidden
                bg-gray-900 border-t border-gray-700
                flex justify-around py-2 z-50">
  <BottomNavItem icon="🏠" label="Home" to="/" />
  <BottomNavItem icon="📊" label="Dashboard" to="/dashboard" />
  <BottomNavItem icon="💰" label="Deposit" to="/deposit" />
  <BottomNavItem icon="🤖" label="AI" to="/ai-decisions" />
</nav>

// Mobile Drawer (slide-in menu)
<Transition show={menuOpen}>
  <div className="fixed inset-0 z-50 md:hidden">
    <div className="fixed inset-0 bg-black/50" onClick={close} />
    <div className="fixed left-0 top-0 h-full w-72 bg-gray-900 p-6">
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/deposit">Deposit</NavLink>
      <NavLink to="/borrow">Borrow</NavLink>
      <NavLink to="/ai-decisions">AI Decisions</NavLink>
      <NavLink to="/analytics">Analytics</NavLink>
    </div>
  </div>
</Transition>
```

### 7.5 Touch-friendly UX (мобильные устройства)

```
Минимальные размеры интерактивных элементов:
├── Кнопки: min-h-[48px] (Apple HIG рекомендует 44pt)
├── Инпуты: min-h-[48px], font-size 16px (предотвращает zoom на iOS)
├── Карточки: p-3 минимум, gap-3 между элементами
├── Навигация: 48px высота tab bar items
└── Свайпы: нет (усложняет, не нужно для MVP)

Phantom Wallet на мобиле:
├── Phantom Browser: приложение работает внутри Phantom
├── Deeplink: phantom://открывает Phantom для подписи
├── WalletAdapter автоматически переключается на deeplink
└── Тестировать на реальном телефоне через devnet
```

---

## 8. Структура проекта (файлы)

```
solana-ai-lend/
│
├── programs/                          # Solana контракт (Anchor/Rust)
│   └── solana-ai-lend/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                 # точка входа
│           ├── instructions/
│           │   ├── mod.rs
│           │   ├── initialize.rs      # создание пула
│           │   ├── deposit.rs         # лендер кладёт aiUSDC
│           │   ├── withdraw.rs        # лендер забирает
│           │   ├── borrow.rs          # заёмщик берёт
│           │   ├── repay.rs           # заёмщик возвращает
│           │   ├── update_params.rs   # AI меняет параметры
│           │   └── liquidate.rs       # ликвидация
│           ├── state/
│           │   ├── mod.rs
│           │   ├── pool.rs            # LendingPool аккаунт
│           │   ├── position.rs        # UserPosition аккаунт
│           │   └── decision_log.rs    # AiDecisionLog аккаунт
│           └── errors.rs
│
├── ai-agent/                          # AI Backend (Python async)
│   ├── main.py                        # multiprocessing запуск
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── orchestrator.py            # async цикл
│   │   ├── data_collector.py          # async сбор данных
│   │   ├── ai_engine.py              # async Gemini API
│   │   ├── validator.py               # CPU-bound валидация
│   │   ├── tx_builder.py             # async TX builder
│   │   └── decision_logger.py        # логирование
│   ├── workers/
│   │   ├── __init__.py
│   │   ├── health_monitor.py          # Process 2
│   │   └── price_watcher.py           # Process 3
│   ├── keys/
│   │   └── ai-agent.json             # keypair AI-агента (devnet)
│   ├── config.py
│   ├── .env                           # GEMINI_API_KEY=AIzaSy...
│   └── requirements.txt
│
├── backend/                           # FastAPI Backend (Python async)
│   ├── main.py                        # точка входа: uvicorn
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py                  # настройки (Pydantic BaseSettings)
│   │   ├── database.py                # aiosqlite подключение
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── schemas.py             # Pydantic response/request models
│   │   │   └── db_models.py           # SQLAlchemy / raw SQL models
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── pool.py                # /api/pool/* — состояние пула
│   │   │   ├── decisions.py           # /api/decisions/* — решения AI
│   │   │   ├── analytics.py           # /api/analytics/* — графики
│   │   │   └── health.py             # /api/health — healthcheck
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── solana_reader.py       # async чтение из Solana devnet
│   │   │   ├── decision_service.py    # SQLite + on-chain merge
│   │   │   └── cache.py              # in-memory кэш (TTL)
│   │   └── ws/
│   │       ├── __init__.py
│   │       └── manager.py            # WebSocket connection manager
│   ├── requirements.txt
│   └── .env                           # SOLANA_RPC_URL, DATABASE_URL
│
├── frontend/                          # React + Vite
│   ├── src/
│   │   ├── main.tsx                   # entry point
│   │   ├── App.tsx                    # router
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Deposit.tsx
│   │   │   ├── Borrow.tsx
│   │   │   ├── AiDecisions.tsx
│   │   │   └── Analytics.tsx
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── PoolStats.tsx
│   │   │   ├── AiDecisionCard.tsx
│   │   │   ├── RateChart.tsx
│   │   │   ├── DepositForm.tsx
│   │   │   ├── BorrowForm.tsx
│   │   │   └── WalletButton.tsx
│   │   ├── hooks/
│   │   │   ├── usePool.ts            # fetch → FastAPI /api/pool
│   │   │   ├── useAiDecisions.ts     # fetch → FastAPI /api/decisions
│   │   │   ├── useBalance.ts
│   │   │   └── useWebSocket.ts       # WebSocket → FastAPI /ws/updates
│   │   ├── utils/
│   │   │   ├── anchor.ts             # подключение к контракту (TX only)
│   │   │   ├── api.ts                # axios/fetch обёртка для FastAPI
│   │   │   └── constants.ts          # program ID, API_URL, devnet RPC
│   │   └── idl/
│   │       └── solana_ai_lend.json   # IDL контракта (авто-генерация)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── tests/                             # тесты контракта
│   └── solana-ai-lend.ts
│
├── scripts/
│   ├── setup-devnet.sh                # настройка devnet + airdrop
│   ├── create-test-token.sh           # создать aiUSDC
│   └── fund-test-users.sh            # раздать тестовые токены
│
├── Anchor.toml                        # cluster = "devnet"
├── package.json
├── ARCHITECTURE.md
└── README.md
```

---

## 9. Devnet Setup — тестовые токены

```bash
#!/bin/bash
# scripts/setup-devnet.sh

# Переключиться на devnet
solana config set --url devnet

# Создать кошелёк (если нет)
solana-keygen new --outfile ./keys/deployer.json --no-bip39-passphrase
solana-keygen new --outfile ./ai-agent/keys/ai-agent.json --no-bip39-passphrase

# Airdrop тестовых SOL
solana airdrop 2 --keypair ./keys/deployer.json
solana airdrop 2 --keypair ./ai-agent/keys/ai-agent.json

# Создать тестовый токен aiUSDC
spl-token create-token --keypair ./keys/deployer.json
# → записать MINT адрес

# Создать аккаунт для токена
spl-token create-account <MINT>

# Намайнить 1 миллион тестовых aiUSDC
spl-token mint <MINT> 1000000

echo "Devnet setup complete!"
echo "Deployer: $(solana-keygen pubkey ./keys/deployer.json)"
echo "AI Agent: $(solana-keygen pubkey ./ai-agent/keys/ai-agent.json)"
```

---

## 10. Демо-сценарии (для жюри)

### Сценарий 1: Нормальная работа
```
1. Показываем дашборд — ставка 5%, залог 150%
2. AI получает данные — SOL стабилен, утилизация растёт
3. AI решает: повысить ставку до 6.5%
4. TX уходит в Solana devnet → параметры обновлены
5. На дашборде видно: новая ставка + объяснение AI
6. Показываем TX в Solana Explorer (devnet)
```

### Сценарий 2: AI пытается нарушить лимиты
```
1. Имитируем: AI хочет поставить ставку 50%
2. Контракт ОТКЛОНЯЕТ: "Rate too high, max 20%"
3. Показываем: контракт защищает от ошибок AI
```

### Сценарий 3: Резкое падение рынка
```
1. SOL падает на 10% (реальные данные с CoinGecko)
2. AI видит: риск залога вырос
3. AI повышает залоговый коэффициент 150% → 170%
4. AI снижает лимит займа
5. Протокол автоматически стал безопаснее
```

---

## 11. Покрытие критериев оценки (100 баллов)

```
Product & Idea (20):
  Реальная проблема — статичные DeFi протоколы
  Реальное решение — адаптивные параметры через AI (Gemini)

Technical Implementation (25):
  Anchor контракт с 7 инструкциями (Rust)
  AI Agent: Python async + multiprocessing + Gemini API
  Frontend: React + Vite + Wallet Adapter
  Полный пайплайн: данные → AI → TX → on-chain

Use of Solana (15):
  Devnet с тестовыми SOL и aiUSDC
  Vault (хранение средств)
  Lending логика (deposit/borrow/repay)
  On-chain decision log
  Guard rails в контракте

Innovation (15):
  Trustless AI — контракт контролирует AI
  Прозрачные решения (reasoning hash on-chain)
  4 уровня защиты от ошибок AI
  Async multiprocess архитектура

UX & Product Thinking (10):
  Простой UI: deposit/borrow
  AI объясняет решения на человеческом языке
  Графики изменения параметров
  Wallet connect в один клик

Demo & Presentation (10):
  3 готовых сценария на devnet
  Контролируемое демо (тестовые токены)
  Живая TX в Solana Explorer

Completeness & Documentation (5):
  README с архитектурой
  Код на GitHub
  Setup scripts для devnet
```

---

## 12. FastAPI Backend -- REST API для Frontend

### 12.1 Зачем нужен FastAPI между Frontend и Solana

```
ПРОБЛЕМА без бэкенда:
├── React напрямую читает Solana RPC → rate limits, медленно
├── React должен десериализовать Anchor-аккаунты → сложный код на фронте
├── Нет кэширования → каждый пользователь делает свои RPC-запросы
├── Нет WebSocket push → фронт делает polling каждые N секунд
├── AI decision history только on-chain → дорого читать полную историю
└── Нет единой точки для аналитики / агрегации

РЕШЕНИЕ — FastAPI backend:
├── Единственная точка чтения данных для фронта (REST + WebSocket)
├── Кэширует состояние пула (TTL 5 сек) → 1 RPC-запрос на всех
├── Хранит AI decisions в SQLite (полная история + reasoning text)
├── Мёржит on-chain данные + локальные данные
├── WebSocket push → фронт получает обновления мгновенно
├── Pydantic модели → строгая типизация запросов/ответов
└── Frontend остаётся тонким: только UI + подпись транзакций
```

### 12.2 Технологии

```
FastAPI            — async REST framework (Starlette + Pydantic)
uvicorn            — ASGI сервер (async)
aiosqlite          — async SQLite (история решений AI)
solana-py          — async Solana RPC client
anchorpy           — десериализация Anchor-аккаунтов
pydantic v2        — модели запросов/ответов
websockets         — real-time push к фронту
httpx              — async HTTP client (для дополнительных API)
```

### 12.3 Конфигурация

```python
# backend/app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Solana
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_ws_url: str = "wss://api.devnet.solana.com"
    program_id: str = ""  # после деплоя

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/decisions.db"

    # Cache
    pool_cache_ttl: int = 5      # секунды
    decisions_cache_ttl: int = 30

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:5173"]  # Vite dev server

    # Pool PDA seeds (для десериализации)
    pool_authority: str = ""  # pubkey authority

    class Config:
        env_file = ".env"
```

### 12.4 Pydantic Models (Request / Response)

```python
# backend/app/models/schemas.py
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

# ═══════════════════════════════════
# Pool State
# ═══════════════════════════════════

class PoolStateResponse(BaseModel):
    """Текущее состояние пула — отдаётся на /api/pool/state"""
    total_deposits: int = Field(..., description="Всего депозитов (lamports)")
    total_borrows: int = Field(..., description="Всего займов (lamports)")
    available_liquidity: int
    utilization_rate: float = Field(..., ge=0, le=1, description="0.0 — 1.0")
    interest_rate_bps: int = Field(..., ge=100, le=2000)
    interest_rate_percent: float = Field(..., description="Человекочитаемый %")
    collateral_ratio_bps: int = Field(..., ge=12000, le=20000)
    collateral_ratio_percent: float
    max_borrow_limit: int
    liquidation_threshold: int
    last_ai_update: datetime
    ai_agent: str = Field(..., description="Pubkey AI агента")

    class Config:
        json_schema_extra = {
            "example": {
                "total_deposits": 50000_000_000,
                "total_borrows": 30000_000_000,
                "available_liquidity": 20000_000_000,
                "utilization_rate": 0.6,
                "interest_rate_bps": 650,
                "interest_rate_percent": 6.5,
                "collateral_ratio_bps": 15500,
                "collateral_ratio_percent": 155.0,
                "max_borrow_limit": 10000_000_000,
                "liquidation_threshold": 12000,
                "last_ai_update": "2026-03-27T14:30:00Z",
                "ai_agent": "AgENt1111111111111111111111111111111111111"
            }
        }

# ═══════════════════════════════════
# AI Decisions
# ═══════════════════════════════════

class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class AiDecisionResponse(BaseModel):
    """Одно решение AI — комбинация on-chain лога + локальной БД"""
    id: int
    timestamp: datetime
    tx_signature: str | None = Field(None, description="Solana TX hash")

    # Старые значения
    old_interest_rate_bps: int
    new_interest_rate_bps: int
    old_collateral_ratio_bps: int
    new_collateral_ratio_bps: int
    old_max_borrow: int
    new_max_borrow: int

    # AI metadata (из SQLite — полный текст, не только хеш)
    reasoning: str = Field(..., description="Объяснение AI на русском")
    confidence: int = Field(..., ge=0, le=100)
    risk_assessment: RiskLevel

    # Контекст на момент решения
    sol_price_at_decision: float | None = None
    utilization_at_decision: float | None = None

    class Config:
        from_attributes = True

class AiDecisionListResponse(BaseModel):
    """Пагинированный список решений"""
    decisions: list[AiDecisionResponse]
    total: int
    page: int
    per_page: int
    has_next: bool

class DecisionQueryParams(BaseModel):
    """Query-параметры для фильтрации решений"""
    page: int = Field(1, ge=1)
    per_page: int = Field(20, ge=1, le=100)
    risk_level: RiskLevel | None = None
    min_confidence: int | None = Field(None, ge=0, le=100)
    from_date: datetime | None = None
    to_date: datetime | None = None

# ═══════════════════════════════════
# Analytics
# ═══════════════════════════════════

class RateHistoryPoint(BaseModel):
    timestamp: datetime
    interest_rate_bps: int
    collateral_ratio_bps: int
    utilization: float | None = None

class AnalyticsResponse(BaseModel):
    """Данные для графиков"""
    rate_history: list[RateHistoryPoint]
    avg_confidence_7d: float
    total_decisions_24h: int
    total_decisions_7d: int
    current_utilization: float

# ═══════════════════════════════════
# User Position
# ═══════════════════════════════════

class UserPositionResponse(BaseModel):
    """Позиция пользователя (чтение из Solana)"""
    owner: str
    deposited: int
    borrowed: int
    collateral: int
    health_factor: float = Field(..., description=">1 = safe, <1 = liquidatable")
    borrow_timestamp: datetime | None = None

# ═══════════════════════════════════
# Health
# ═══════════════════════════════════

class HealthResponse(BaseModel):
    status: str = "ok"
    solana_connected: bool
    database_connected: bool
    last_pool_fetch: datetime | None = None
    uptime_seconds: float
```

### 12.5 Solana Reader Service (async)

```python
# backend/app/services/solana_reader.py
import asyncio
import time
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from anchorpy import Program, Provider
from app.config import Settings
from app.models.schemas import PoolStateResponse, UserPositionResponse
from datetime import datetime, timezone

class SolanaReader:
    """Async чтение данных из Solana devnet.
       Кэширует состояние пула на N секунд (TTL)."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = AsyncClient(settings.solana_rpc_url)
        self.program_id = Pubkey.from_string(settings.program_id)
        self._pool_cache: PoolStateResponse | None = None
        self._pool_cache_time: float = 0

    async def get_pool_state(self) -> PoolStateResponse:
        """Читает LendingPool аккаунт. Кэш TTL = pool_cache_ttl сек."""
        now = time.monotonic()
        if (
            self._pool_cache is not None
            and (now - self._pool_cache_time) < self.settings.pool_cache_ttl
        ):
            return self._pool_cache

        # Вычислить PDA
        pool_pda, _bump = Pubkey.find_program_address(
            [b"lending_pool", bytes(Pubkey.from_string(self.settings.pool_authority))],
            self.program_id,
        )

        # Прочитать аккаунт через RPC
        resp = await self.client.get_account_info(pool_pda)
        if resp.value is None:
            raise ValueError(f"Pool account {pool_pda} not found on devnet")

        # Десериализация через Anchor IDL
        # В реальности: program = await Program.at(self.program_id, provider)
        # pool_data = await program.account["LendingPool"].fetch(pool_pda)
        # Здесь — пример структуры:
        data = self._deserialize_pool(resp.value.data)

        total_deps = data["total_deposits"]
        total_borr = data["total_borrows"]
        utilization = total_borr / total_deps if total_deps > 0 else 0.0

        pool_state = PoolStateResponse(
            total_deposits=total_deps,
            total_borrows=total_borr,
            available_liquidity=data["available_liquidity"],
            utilization_rate=round(utilization, 4),
            interest_rate_bps=data["interest_rate_bps"],
            interest_rate_percent=round(data["interest_rate_bps"] / 100, 2),
            collateral_ratio_bps=data["collateral_ratio_bps"],
            collateral_ratio_percent=round(data["collateral_ratio_bps"] / 100, 2),
            max_borrow_limit=data["max_borrow_limit"],
            liquidation_threshold=data["liquidation_threshold"],
            last_ai_update=datetime.fromtimestamp(data["last_update"], tz=timezone.utc),
            ai_agent=str(data["ai_agent"]),
        )

        self._pool_cache = pool_state
        self._pool_cache_time = now
        return pool_state

    async def get_user_position(self, owner_pubkey: str) -> UserPositionResponse | None:
        """Читает UserPosition PDA для конкретного пользователя."""
        pool_pda, _ = Pubkey.find_program_address(
            [b"lending_pool", bytes(Pubkey.from_string(self.settings.pool_authority))],
            self.program_id,
        )
        owner = Pubkey.from_string(owner_pubkey)
        position_pda, _ = Pubkey.find_program_address(
            [b"position", bytes(pool_pda), bytes(owner)],
            self.program_id,
        )

        resp = await self.client.get_account_info(position_pda)
        if resp.value is None:
            return None

        data = self._deserialize_position(resp.value.data)

        pool = await self.get_pool_state()
        # health_factor = collateral_value / (borrowed * liquidation_threshold / 10000)
        health = (
            data["collateral"] / (data["borrowed"] * pool.liquidation_threshold / 10000)
            if data["borrowed"] > 0
            else float("inf")
        )

        return UserPositionResponse(
            owner=owner_pubkey,
            deposited=data["deposited"],
            borrowed=data["borrowed"],
            collateral=data["collateral"],
            health_factor=round(health, 4),
            borrow_timestamp=(
                datetime.fromtimestamp(data["borrow_timestamp"], tz=timezone.utc)
                if data["borrow_timestamp"] > 0 else None
            ),
        )

    def _deserialize_pool(self, raw_data: bytes) -> dict:
        """Десериализация через Borsh / Anchor IDL.
           В продакшене — через anchorpy Program.account["LendingPool"].coder"""
        # Placeholder — в реальности Anchor IDL парсит байты
        ...

    def _deserialize_position(self, raw_data: bytes) -> dict:
        """Десериализация UserPosition."""
        ...

    async def close(self):
        await self.client.close()
```

### 12.6 Decision Service (SQLite + On-Chain merge)

```python
# backend/app/services/decision_service.py
import aiosqlite
from app.config import Settings
from app.models.schemas import (
    AiDecisionResponse,
    AiDecisionListResponse,
    DecisionQueryParams,
    RiskLevel,
)
from datetime import datetime, timezone

DB_INIT_SQL = """
CREATE TABLE IF NOT EXISTS ai_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    tx_signature TEXT,
    old_interest_rate_bps INTEGER NOT NULL,
    new_interest_rate_bps INTEGER NOT NULL,
    old_collateral_ratio_bps INTEGER NOT NULL,
    new_collateral_ratio_bps INTEGER NOT NULL,
    old_max_borrow INTEGER NOT NULL,
    new_max_borrow INTEGER NOT NULL,
    reasoning TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    risk_assessment TEXT NOT NULL,
    sol_price_at_decision REAL,
    utilization_at_decision REAL
);

CREATE INDEX IF NOT EXISTS idx_decisions_ts ON ai_decisions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_risk ON ai_decisions(risk_assessment);
"""

class DecisionService:
    """Хранит полную историю решений AI в SQLite.
       AI Agent пишет сюда после каждого цикла (reasoning полный текст).
       On-chain хранится только reasoning_hash — тут полный текст."""

    def __init__(self, settings: Settings):
        self.db_path = settings.database_url.replace("sqlite+aiosqlite:///", "")

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.executescript(DB_INIT_SQL)
            await db.commit()

    async def save_decision(
        self,
        decision: dict,
        tx_signature: str | None,
        sol_price: float | None,
        utilization: float | None,
    ) -> int:
        """AI Agent вызывает после успешного цикла."""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """INSERT INTO ai_decisions
                   (timestamp, tx_signature,
                    old_interest_rate_bps, new_interest_rate_bps,
                    old_collateral_ratio_bps, new_collateral_ratio_bps,
                    old_max_borrow, new_max_borrow,
                    reasoning, confidence, risk_assessment,
                    sol_price_at_decision, utilization_at_decision)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    datetime.now(timezone.utc).isoformat(),
                    tx_signature,
                    decision["old_interest_rate_bps"],
                    decision["interest_rate_bps"],
                    decision["old_collateral_ratio_bps"],
                    decision["collateral_ratio_bps"],
                    decision["old_max_borrow"],
                    decision["max_borrow_limit"],
                    decision["reasoning"],
                    decision["confidence"],
                    decision["risk_assessment"],
                    sol_price,
                    utilization,
                ),
            )
            await db.commit()
            return cursor.lastrowid

    async def get_decisions(
        self, params: DecisionQueryParams
    ) -> AiDecisionListResponse:
        """Пагинированный список с фильтрами."""
        conditions: list[str] = []
        args: list = []

        if params.risk_level:
            conditions.append("risk_assessment = ?")
            args.append(params.risk_level.value)
        if params.min_confidence is not None:
            conditions.append("confidence >= ?")
            args.append(params.min_confidence)
        if params.from_date:
            conditions.append("timestamp >= ?")
            args.append(params.from_date.isoformat())
        if params.to_date:
            conditions.append("timestamp <= ?")
            args.append(params.to_date.isoformat())

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        offset = (params.page - 1) * params.per_page

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            # Total count
            count_row = await db.execute_fetchall(
                f"SELECT COUNT(*) as cnt FROM ai_decisions {where_clause}", args
            )
            total = count_row[0]["cnt"] if count_row else 0

            # Data
            rows = await db.execute_fetchall(
                f"""SELECT * FROM ai_decisions {where_clause}
                    ORDER BY timestamp DESC
                    LIMIT ? OFFSET ?""",
                args + [params.per_page, offset],
            )

            decisions = [
                AiDecisionResponse(
                    id=row["id"],
                    timestamp=datetime.fromisoformat(row["timestamp"]),
                    tx_signature=row["tx_signature"],
                    old_interest_rate_bps=row["old_interest_rate_bps"],
                    new_interest_rate_bps=row["new_interest_rate_bps"],
                    old_collateral_ratio_bps=row["old_collateral_ratio_bps"],
                    new_collateral_ratio_bps=row["new_collateral_ratio_bps"],
                    old_max_borrow=row["old_max_borrow"],
                    new_max_borrow=row["new_max_borrow"],
                    reasoning=row["reasoning"],
                    confidence=row["confidence"],
                    risk_assessment=RiskLevel(row["risk_assessment"]),
                    sol_price_at_decision=row["sol_price_at_decision"],
                    utilization_at_decision=row["utilization_at_decision"],
                )
                for row in rows
            ]

        return AiDecisionListResponse(
            decisions=decisions,
            total=total,
            page=params.page,
            per_page=params.per_page,
            has_next=(offset + params.per_page) < total,
        )

    async def get_latest(self) -> AiDecisionResponse | None:
        """Последнее решение AI."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            rows = await db.execute_fetchall(
                "SELECT * FROM ai_decisions ORDER BY timestamp DESC LIMIT 1"
            )
            if not rows:
                return None
            row = rows[0]
            return AiDecisionResponse(
                id=row["id"],
                timestamp=datetime.fromisoformat(row["timestamp"]),
                tx_signature=row["tx_signature"],
                old_interest_rate_bps=row["old_interest_rate_bps"],
                new_interest_rate_bps=row["new_interest_rate_bps"],
                old_collateral_ratio_bps=row["old_collateral_ratio_bps"],
                new_collateral_ratio_bps=row["new_collateral_ratio_bps"],
                old_max_borrow=row["old_max_borrow"],
                new_max_borrow=row["new_max_borrow"],
                reasoning=row["reasoning"],
                confidence=row["confidence"],
                risk_assessment=RiskLevel(row["risk_assessment"]),
                sol_price_at_decision=row["sol_price_at_decision"],
                utilization_at_decision=row["utilization_at_decision"],
            )
```

### 12.7 WebSocket Manager (real-time push)

```python
# backend/app/ws/manager.py
import asyncio
import json
from fastapi import WebSocket
from app.models.schemas import PoolStateResponse, AiDecisionResponse

class ConnectionManager:
    """Управляет WebSocket подключениями.
       Фронт подключается один раз и получает push-уведомления."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.remove(websocket)

    async def broadcast_pool_update(self, pool: PoolStateResponse):
        """Отправить обновление пула всем подключённым клиентам."""
        message = json.dumps({
            "type": "pool_update",
            "data": pool.model_dump(mode="json"),
        })
        await self._broadcast(message)

    async def broadcast_new_decision(self, decision: AiDecisionResponse):
        """Отправить новое решение AI всем клиентам."""
        message = json.dumps({
            "type": "new_decision",
            "data": decision.model_dump(mode="json"),
        })
        await self._broadcast(message)

    async def _broadcast(self, message: str):
        """Отправить сообщение всем, отключить мёртвые соединения."""
        dead: list[WebSocket] = []
        async with self._lock:
            connections = list(self.active_connections)

        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self.active_connections:
                        self.active_connections.remove(ws)
```

### 12.8 REST API Routers

```python
# backend/app/routers/pool.py
from fastapi import APIRouter, Depends, HTTPException
from app.models.schemas import PoolStateResponse, UserPositionResponse
from app.services.solana_reader import SolanaReader

router = APIRouter(prefix="/api/pool", tags=["Pool"])

# Dependency injection (SolanaReader создаётся в main.py, передаётся через app.state)
async def get_solana_reader() -> SolanaReader:
    from app.main_app import app
    return app.state.solana_reader

@router.get("/state", response_model=PoolStateResponse)
async def get_pool_state(
    reader: SolanaReader = Depends(get_solana_reader),
):
    """Текущее состояние пула (кэш TTL 5 сек)."""
    try:
        return await reader.get_pool_state()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Solana RPC error: {e}")

@router.get("/position/{owner_pubkey}", response_model=UserPositionResponse)
async def get_user_position(
    owner_pubkey: str,
    reader: SolanaReader = Depends(get_solana_reader),
):
    """Позиция конкретного пользователя."""
    position = await reader.get_user_position(owner_pubkey)
    if position is None:
        raise HTTPException(status_code=404, detail="Position not found")
    return position
```

```python
# backend/app/routers/decisions.py
from fastapi import APIRouter, Depends, Query
from app.models.schemas import (
    AiDecisionResponse,
    AiDecisionListResponse,
    DecisionQueryParams,
    RiskLevel,
)
from app.services.decision_service import DecisionService
from datetime import datetime

router = APIRouter(prefix="/api/decisions", tags=["AI Decisions"])

async def get_decision_service() -> DecisionService:
    from app.main_app import app
    return app.state.decision_service

@router.get("/", response_model=AiDecisionListResponse)
async def list_decisions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    risk_level: RiskLevel | None = None,
    min_confidence: int | None = Query(None, ge=0, le=100),
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    service: DecisionService = Depends(get_decision_service),
):
    """Пагинированный список решений AI с фильтрами."""
    params = DecisionQueryParams(
        page=page,
        per_page=per_page,
        risk_level=risk_level,
        min_confidence=min_confidence,
        from_date=from_date,
        to_date=to_date,
    )
    return await service.get_decisions(params)

@router.get("/latest", response_model=AiDecisionResponse | None)
async def get_latest_decision(
    service: DecisionService = Depends(get_decision_service),
):
    """Самое последнее решение AI."""
    return await service.get_latest()
```

```python
# backend/app/routers/analytics.py
from fastapi import APIRouter, Depends
from app.models.schemas import AnalyticsResponse, RateHistoryPoint
from app.services.decision_service import DecisionService
from app.services.solana_reader import SolanaReader

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

@router.get("/", response_model=AnalyticsResponse)
async def get_analytics(
    # ... dependencies
):
    """Данные для графиков: история ставок, средний confidence, и т.д."""
    ...
```

```python
# backend/app/routers/health.py
from fastapi import APIRouter
from app.models.schemas import HealthResponse
import time

router = APIRouter(tags=["Health"])
_start_time = time.monotonic()

@router.get("/api/health", response_model=HealthResponse)
async def healthcheck():
    return HealthResponse(
        status="ok",
        solana_connected=True,   # TODO: реальная проверка
        database_connected=True, # TODO: реальная проверка
        uptime_seconds=round(time.monotonic() - _start_time, 1),
    )
```

### 12.9 Main Application (точка входа)

```python
# backend/main.py
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.services.solana_reader import SolanaReader
from app.services.decision_service import DecisionService
from app.ws.manager import ConnectionManager
from app.routers import pool, decisions, analytics, health

settings = Settings()

# WebSocket manager — глобальный
ws_manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / Shutdown."""
    # === STARTUP ===
    app.state.settings = settings
    app.state.solana_reader = SolanaReader(settings)
    app.state.decision_service = DecisionService(settings)
    app.state.ws_manager = ws_manager

    # Создать таблицы SQLite
    await app.state.decision_service.init_db()

    # Запустить фоновую задачу: poll Solana каждые 5 сек → push через WS
    app.state.poll_task = asyncio.create_task(poll_pool_state(app))

    print(f"[FastAPI] Started on {settings.host}:{settings.port}")
    yield

    # === SHUTDOWN ===
    app.state.poll_task.cancel()
    await app.state.solana_reader.close()
    print("[FastAPI] Shutdown complete")

app = FastAPI(
    title="SolanaAI Lend API",
    description="REST API + WebSocket для AI-Powered Lending Protocol на Solana devnet",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — разрешить фронту на localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === ROUTERS ===
app.include_router(pool.router)
app.include_router(decisions.router)
app.include_router(analytics.router)
app.include_router(health.router)

# === WEBSOCKET ===
@app.websocket("/ws/updates")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket для real-time обновлений.

    Frontend подключается:
      const ws = new WebSocket("ws://localhost:8000/ws/updates");
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "pool_update") { ... }
        if (msg.type === "new_decision") { ... }
      };
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Ждём сообщения от клиента (ping / подписки)
            data = await websocket.receive_text()
            # Можно обработать: subscribe/unsubscribe от определённых событий
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)

# === BACKGROUND TASK: poll Solana → push WS ===
async def poll_pool_state(app: FastAPI):
    """Каждые 5 сек читаем пул из Solana и пушим обновление в WebSocket."""
    reader: SolanaReader = app.state.solana_reader
    manager: ConnectionManager = app.state.ws_manager
    prev_state = None

    while True:
        try:
            state = await reader.get_pool_state()
            # Push только если что-то изменилось
            if prev_state is None or state != prev_state:
                await manager.broadcast_pool_update(state)
                prev_state = state
        except Exception as e:
            print(f"[POLL ERROR] {e}")
        await asyncio.sleep(5)

# === ТОЧКА ВХОДА ===
# Запуск: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 12.10 Frontend подключение к FastAPI

```typescript
// frontend/src/utils/api.ts
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function fetchPoolState(): Promise<PoolState> {
  const res = await fetch(`${API_BASE}/api/pool/state`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchDecisions(
  page = 1,
  perPage = 20,
): Promise<DecisionList> {
  const res = await fetch(
    `${API_BASE}/api/decisions/?page=${page}&per_page=${perPage}`,
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchUserPosition(
  pubkey: string,
): Promise<UserPosition | null> {
  const res = await fetch(`${API_BASE}/api/pool/position/${pubkey}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

```typescript
// frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/updates";

interface WsMessage {
  type: "pool_update" | "new_decision";
  data: unknown;
}

export function useWebSocket(
  onPoolUpdate?: (data: PoolState) => void,
  onNewDecision?: (data: AiDecision) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect через 3 сек
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      if (msg.type === "pool_update" && onPoolUpdate) {
        onPoolUpdate(msg.data as PoolState);
      }
      if (msg.type === "new_decision" && onNewDecision) {
        onNewDecision(msg.data as AiDecision);
      }
    };

    wsRef.current = ws;
  }, [onPoolUpdate, onNewDecision]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return { connected };
}
```

### 12.11 Диаграмма потоков данных (Frontend <-> FastAPI <-> Solana)

```
ЧТЕНИЕ ДАННЫХ (Frontend → FastAPI → Solana / SQLite):

  React           FastAPI                Solana devnet
  ─────           ───────                ─────────────
    │                │                        │
    │  GET /api/pool/state                    │
    │───────────────►│                        │
    │                │  getAccountInfo(PDA)   │
    │                │───────────────────────►│
    │                │◄───────────────────────│
    │                │  deserialize + cache    │
    │◄───────────────│                        │
    │  PoolStateResponse (JSON)               │
    │                │                        │
    │  GET /api/decisions/?page=1             │
    │───────────────►│                        │
    │                │  SELECT FROM sqlite     │
    │                │  (полный reasoning text)│
    │◄───────────────│                        │
    │  AiDecisionListResponse                 │
    │                │                        │

REAL-TIME (WebSocket push):

  React           FastAPI              Solana devnet
  ─────           ───────              ─────────────
    │                │                       │
    │  WS /ws/updates (connect)              │
    │◄══════════════►│                       │
    │                │  [background task]     │
    │                │  poll every 5 sec      │
    │                │──────────────────────►│
    │                │◄─────────────────────│
    │  {"type":"pool_update", "data":{...}}  │
    │◄═══════════════│                       │
    │                │                       │

ЗАПИСЬ (Frontend → Solana напрямую, минуя FastAPI):

  React           Phantom Wallet       Solana devnet
  ─────           ──────────────       ─────────────
    │                 │                      │
    │  deposit(1000)  │                      │
    │────────────────►│                      │
    │                 │  sign TX             │
    │                 │─────────────────────►│
    │                 │◄────────────────────│
    │◄────────────────│  TX confirmed       │
    │                 │                      │

ВАЖНО: Frontend подписывает TX через Phantom → Solana НАПРЯМУЮ.
FastAPI НЕ участвует в записи. Только чтение + WebSocket push.
```

### 12.12 requirements.txt (backend)

```
# backend/requirements.txt
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
aiosqlite>=0.19.0
solana>=0.32.0
solders>=0.20.0
anchorpy>=0.20.0
httpx>=0.26.0
websockets>=12.0
python-dotenv>=1.0.0
```

### 12.13 Запуск

```bash
# 1. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # заполнить PROGRAM_ID, POOL_AUTHORITY

uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Frontend (в другом терминале)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" >> .env
npm run dev    # → http://localhost:5173

# 3. AI Agent (в третьем терминале)
cd ai-agent
pip install -r requirements.txt
python main.py

# Проверка:
# curl http://localhost:8000/api/health
# curl http://localhost:8000/api/pool/state
# curl http://localhost:8000/api/decisions/?page=1
# curl http://localhost:8000/docs   ← Swagger UI (авто-генерация FastAPI)
```

---

## 13. Поведение системы в рыночных сценариях

Система реагирует на рынок через **математику + ML**, не через угадывание. Ниже — полный разбор поведения в каждом сценарии.

### 13.1 Волатильность (резкие скачки цен)

```
СЦЕНАРИЙ: SOL прыгает ±8% за час

ЧТО СЧИТАЕТ МАТЕМАТИКА:
├── ATR: резко вырос → перцентиль 95% (исторический максимум)
├── Bollinger Bands: bandwidth расширяется → подтверждает волатильность
├── EWMA модель: predicted_volatility = 9.2% → режим "high"
├── IsolationForest: anomaly_score = -0.6 → АНОМАЛИЯ ОБНАРУЖЕНА

ЧТО ДЕЛАЕТ СИСТЕМА:
├── Risk Score: 78/100 → "high" (почти critical)
├── Формула утилизации: ставка +3% к текущей
├── Рекомендация: ПОВЫСИТЬ залог до 180%, СНИЗИТЬ лимит займа
│
├── Gemini интерпретирует:
│   "ATR на 95-м перцентиле, аномалия подтверждена ML.
│    Повышаю залог 150% → 175% (не до 180%, т.к. MACD
│    ещё бычий — не полная паника). Ставку +2.5%.
│    Лимит займа снижаю на 30%."
│
└── Контракт: проверяет что 175% в рамках [120%-200%] → ОК

ИТОГ: Протокол АВТОМАТИЧЕСКИ стал консервативнее.
      Заёмщикам сложнее брать займы = меньше риска для лендеров.
      Когда волатильность упадёт — параметры вернутся назад.
```

### 13.2 Спекуляции (pump & dump, манипуляции)

```
СЦЕНАРИЙ: SOL вырос на 15% за 2 часа без видимых причин

ЧТО СЧИТАЕТ МАТЕМАТИКА:
├── RSI: 88 → экстремально перекуплен
├── MACD: гистограмма растёт, но ЭТО ЛОВУШКА:
│   объёмы НЕ подтверждают рост (divergence)
├── Bollinger %B: 1.3 → далеко за верхней полосой
├── IsolationForest: anomaly_score = -0.8 → СИЛЬНАЯ АНОМАЛИЯ
├── Trend predictor: confidence = 0.3 → МОДЕЛЬ НЕ УВЕРЕНА
│   (исторически такие пампы не держатся)

ЧТО ДЕЛАЕТ СИСТЕМА:
├── Risk Score: 85/100 → "critical"
├── math_confidence: 0.9 (почти все индикаторы согласны: ОПАСНО)
│
├── Gemini интерпретирует:
│   "RSI=88 — экстремальный. Bollinger %B=1.3 — цена за
│    пределами нормы. Объёмы не подтверждают рост (bearish
│    divergence). ML anomaly score -0.8 — высокая вероятность
│    манипуляции. Перехожу в защитный режим:
│    залог 150% → 190%, ставка +4%, лимит займа -50%."
│
└── ДОПОЛНИТЕЛЬНО: Price Watcher (Process 3) засёк
    движение >5% за 5 мин → отправил алерт → Orchestrator
    запустил ВНЕОЧЕРЕДНОЙ цикл анализа (не ждёт 10 минут)

ИТОГ: При pump система НЕ радуется росту, а ЗАЩИЩАЕТСЯ.
      Высокий залог = заёмщики защищены от ликвидации при обратном падении.
      Низкий лимит = протокол не выдаёт займы на "пиковой" цене.
```

### 13.3 Технические аспекты (on-chain метрики)

```
СЦЕНАРИЙ: Утилизация пула выросла с 60% до 85%

ЧТО СЧИТАЕТ МАТЕМАТИКА:
├── Utilization Curve (формула Aave):
│   U=60%: R = 1% + (0.60/0.80) * 4% = 4.0%
│   U=85%: R = 1% + 4% + ((0.85-0.80)/0.20) * 15% = 8.75%
│   → ставка ДОЛЖНА вырасти с 4% до 8.75% по формуле
│
├── Utilization Predictor (ML):
│   predicted_utilization = 0.90 через 2 часа (растёт!)
│   → нужно действовать УПРЕЖДАЮЩЕ, не ждать 90%
│
├── Liquidity risk:
│   available_liquidity снизилась до 15% от пула
│   → если ещё снизится — лендеры не смогут вывести

ЧТО ДЕЛАЕТ СИСТЕМА:
├── Формула говорит: 8.75%
├── ML говорит: утилизация продолжит расти → ставку надо выше
├── Gemini: "Формула рекомендует 8.75%, но ML прогнозирует
│   утилизацию 90% через 2 часа. Ставлю 9.5% упреждающе —
│   это привлечёт лендеров ДО того как ликвидность станет
│   критической. Залог оставляю — проблема в ликвидности,
│   не в волатильности."

ИТОГ: Система НЕ реагирует постфактум. ML предсказывает
      будущую утилизацию и действует ЗАРАНЕЕ.
```

### 13.4 Новости (sentiment через последствия)

```
СЦЕНАРИЙ: SEC объявила проверку DeFi протоколов

КАК УЗНАЁМ (системе не нужно "читать" новости):
├── Напрямую: CoinGecko API → резкое падение объёмов + цены
├── Косвенно: математика видит ПОСЛЕДСТВИЯ новости:
│   - Цена падает, объёмы растут (паника)
│   - Корреляция SOL/BTC ломается (SOL падает сильнее рынка)
│   - Anomaly detector: -0.7 (аномальное поведение)

ЧТО СЧИТАЕТ МАТЕМАТИКА:
├── RSI: быстрое падение с 55 до 35 за 2 часа
├── MACD: bearish crossover (сигнальная линия пересекла MACD)
├── Bollinger: %B = -0.1 (цена НИЖЕ нижней полосы)
├── EMA: 9 < 21 → медвежий crossover
├── Volume: в 3 раза выше среднего → panic selling

ВСЕ ИНДИКАТОРЫ СОГЛАСНЫ: bearish
├── math_confidence: 0.95 (максимальное согласие)
├── risk_score: 82 → "critical"
├── recommended_direction: МАКСИМАЛЬНАЯ ЗАЩИТА

├── Gemini: "5 из 5 индикаторов bearish. RSI упал на 20 пунктов
│   за 2 часа — это не коррекция, это panic sell. Anomaly score
│   -0.7. Включаю максимальную защиту: залог 190%, ставка до 15%
│   (привлекаю экстренную ликвидность), лимит займа -70%.
│   При confidence 0.95 математики — полное доверие сигналам."

ИТОГ: Системе не нужно "читать новости". Она видит
      РЕАКЦИЮ рынка на новости через математику.
      Последствия новости = цифры. Цифры = индикаторы.
```

### 13.5 Психология паттернов (market psychology)

Психология толпы создаёт повторяющиеся паттерны. Система ловит их через математику:

```
┌─ ПАТТЕРН: "Жадность" (Greed / FOMO) ────────────────────┐
│ Признаки:                                                 │
│ ├── RSI > 75 (все покупают)                              │
│ ├── Bollinger %B > 1 (цена выше нормы)                   │
│ ├── Объёмы растут экспоненциально                         │
│ ├── IsolationForest: аномалия (такой рост ненормален)    │
│                                                           │
│ Реакция системы:                                          │
│ ├── Повышаем залог (скоро будет коррекция)               │
│ ├── Повышаем ставку (привлекаем ликвидность заранее)     │
│ └── Снижаем лимиты (не давать в долг на пике)            │
└───────────────────────────────────────────────────────────┘

┌─ ПАТТЕРН: "Страх" (Fear / Panic) ────────────────────────┐
│ Признаки:                                                 │
│ ├── RSI < 25 (все продают, паника)                       │
│ ├── Bollinger %B < 0 (цена ниже нормы)                   │
│ ├── MACD: глубокий bearish                               │
│ ├── Но: объёмы ПАДАЮТ (продавцы заканчиваются!)          │
│                                                           │
│ Реакция системы:                                          │
│ ├── Залог ВЫСОКИЙ (рынок ещё опасен)                     │
│ ├── НО ставку начинаем СНИЖАТЬ (готовимся к отскоку)     │
│ └── Лимиты чуть повышаем (скоро спрос на займы вырастет) │
└───────────────────────────────────────────────────────────┘

┌─ ПАТТЕРН: "Капитуляция → Разворот" ─────────────────────┐
│ Признаки:                                                 │
│ ├── RSI < 20 (экстремальный oversold)                    │
│ ├── Объём: spike + затухание (последние продавцы вышли)   │
│ ├── Bollinger: bandwidth сужается после расширения        │
│ ├── MACD: гистограмма начинает расти (замедление падения)│
│ ├── EMA: 9 приближается к 21 снизу (готовится crossover) │
│                                                           │
│ Реакция: ML видит это как РАЗВОРОТ                        │
│ ├── trend_prediction: +3% с confidence 0.7               │
│ ├── Система начинает ПЛАВНО смягчать параметры           │
│ └── Не резко! Изменение <= 20% за раз (guard rail)       │
└───────────────────────────────────────────────────────────┘

┌─ ПАТТЕРН: "Боковик" (Accumulation / Sideways) ───────────┐
│ Признаки:                                                 │
│ ├── RSI: 45-55 (нейтральный)                            │
│ ├── Bollinger: bandwidth минимальный (сжатие)            │
│ ├── ATR: низкий (нет движения)                           │
│ ├── MACD: около нуля, без тренда                         │
│ ├── Anomaly: нет (всё нормально)                         │
│                                                           │
│ Реакция: НИЧЕГО НЕ МЕНЯТЬ                                │
│ ├── confidence < 50 → Gemini: "Рынок в боковике,         │
│ │   индикаторы нейтральны, нет оснований для изменений"  │
│ └── Система ПРОПУСКАЕТ цикл — не делает TX               │
│     (экономит комиссии + не создаёт лишний шум)          │
└───────────────────────────────────────────────────────────┘
```

### 13.6 Сводная таблица реакций

```
Ситуация              RSI    Vol    Anomaly  Risk   Ставка   Залог    Лимит
──────────────────────────────────────────────────────────────────────────────
Стабильный рынок      45-55  low    нет      20     hold     hold     hold
Бычий тренд           60-70  med    нет      35     -1%      hold     +10%
Перегрев (FOMO)       >75    high   ДА       70     +3%      +20%     -30%
Pump & Dump           >85    high   ДА       85     +5%      +30%     -50%
Коррекция             35-45  med    нет      45     +1%      +10%     hold
Паника (Fear)         <30    high   ДА       75     +4%      +25%     -40%
Капитуляция→разворот  <25    падает ДА→нет   60→40  hold     -5%      +10%
Боковик               45-55  low    нет      15     skip     skip     skip
Высокая утилизация    —      —      нет      50     +формула hold     -20%
Низкая ликвидность    —      —      нет      60     +5%      +10%     -40%
```

### 13.7 Принцип работы

```
Система НЕ ГАДАЕТ. Каждое действие:

  Конкретный индикатор (RSI=72)
        │
        ▼
  Конкретная формула (RSI > 70 → +1 голос за повышение)
        │
        ▼
  ML модель подтверждает (risk_score=78)
        │
        ▼
  Формула утилизации даёт ЧИСЛО (optimal_rate = 8.75%)
        │
        ▼
  Gemini выбирает из диапазона [8.0% - 9.5%]
  и объясняет ПОЧЕМУ выбрал именно 9.5%
  со ссылкой на конкретные индикаторы
        │
        ▼
  Контракт проверяет: 9.5% в рамках [1%-20%]? ✅
        │
        ▼
  Параметр обновлён on-chain + лог записан
```

---

## 14. Паттерны из существующих контрактов (ai_dispute_resolver + ai_dynamic_nft)

Анализ двух контрактов в `/root/Solana/` выявил полезные паттерны, которые усиливают наш проект.

### 14.1 On-chain AI Reasoning (из ai_dispute_resolver)

```
БЫЛО (наш старый подход):
  AiDecisionLog.reasoning_hash = SHA256(reasoning)
  Полный текст — только off-chain

  Проблема: пользователь не может прочитать reasoning прямо в блокчейне.
  Хеш — это proof, но не transparency.

БЕРЁМ (из dispute_resolver):
  Deal.ai_reasoning: String (max 1024 chars)  ← полный текст on-chain

НОВЫЙ ПОДХОД (гибрид):
  AiDecisionLog {
    reasoning_hash: [u8; 32],           // SHA256 полного текста (proof)
    reasoning_short: String (max 256),  // краткое объяснение ON-CHAIN
    confidence: u8,
  }

  On-chain:  "Ставка 5%→6.5%: RSI=72 перекуплен, утилизация 60%→65%, risk medium"
  Off-chain: полный текст с деталями всех индикаторов

  Зачем: любой может прочитать логику AI прямо в Solana Explorer.
  Для жюри: "Вот TX, вот reasoning — всё прозрачно."
```

Обновлённый аккаунт:

```rust
#[account]
#[derive(InitSpace)]
pub struct AiDecisionLog {
    pub pool: Pubkey,
    pub timestamp: i64,
    pub old_interest_rate: u16,
    pub new_interest_rate: u16,
    pub old_collateral_ratio: u16,
    pub new_collateral_ratio: u16,
    pub old_max_borrow: u64,
    pub new_max_borrow: u64,
    pub reasoning_hash: [u8; 32],     // SHA256 полного текста
    #[max_len(256)]
    pub reasoning_short: String,       // краткое объяснение ON-CHAIN
    pub confidence: u8,
    pub risk_level: RiskLevel,         // enum: Low/Medium/High/Critical
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}
```

### 14.2 Protocol Stats (из обоих контрактов)

```
ПАТТЕРН: Оба контракта ведут глобальную статистику:
  Platform.total_deals / total_disputes / total_resolved
  Collection.total_minted / total_updates

БЕРЁМ: Добавляем ProtocolStats в LendingPool:
```

```rust
// Добавляем в LendingPool:
pub struct LendingPool {
    // ... существующие поля ...

    // === PROTOCOL STATS (on-chain метрики) ===
    pub total_deposits_count: u64,      // всего операций deposit
    pub total_borrows_count: u64,       // всего операций borrow
    pub total_ai_updates: u64,          // сколько раз AI обновлял параметры
    pub total_ai_skips: u64,            // сколько раз AI пропустил цикл
    pub total_liquidations: u64,        // сколько ликвидаций
    pub protocol_created_at: i64,       // когда создан протокол
}
```

```
Зачем:
├── Дашборд показывает: "AI принял 147 решений, пропустил 23"
├── Это ДОКАЗАТЕЛЬСТВО что AI реально работает (не галочка)
├── Жюри видит: "Протокол живой, 147 on-chain обновлений"
└── Use of Solana (15 баллов) — больше данных on-chain = выше оценка
```

### 14.3 Event-Driven Architecture (из ai_dispute_resolver)

```
ПАТТЕРН: dispute_resolver эмитит event на КАЖДОЕ действие:
  DealCreated, DealCompleted, DisputeOpened, EvidenceSubmitted, DisputeResolved

Это позволяет:
├── Frontend подписывается на события через WebSocket
├── Не нужен polling — обновления мгновенные
├── Внешние сервисы могут слушать события
└── Полная история действий в логах транзакций

БЕРЁМ: Полный набор events для нашего контракта:
```

```rust
// Events для КАЖДОГО действия
#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub ai_agent: Pubkey,
    pub initial_rate_bps: u16,
}

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
    pub deposits_count: u64,
}

#[event]
pub struct WithdrawEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
}

#[event]
pub struct BorrowEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub collateral: u64,
    pub interest_rate_bps: u16,       // ставка на момент займа
    pub total_borrows: u64,
}

#[event]
pub struct RepayEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub interest_paid: u64,
    pub total_borrows: u64,
}

#[event]
pub struct AiParametersUpdated {
    pub timestamp: i64,
    pub old_rate: u16,
    pub new_rate: u16,
    pub old_collateral: u16,
    pub new_collateral: u16,
    pub reasoning_short: String,      // краткое объяснение
    pub confidence: u8,
    pub risk_level: RiskLevel,
    pub ai_update_count: u64,         // какое по счёту обновление
}

#[event]
pub struct AiCycleSkipped {
    pub timestamp: i64,
    pub reason: String,               // "low confidence" / "no change needed"
    pub skip_count: u64,
}

#[event]
pub struct LiquidationEvent {
    pub borrower: Pubkey,
    pub liquidator: Pubkey,
    pub amount: u64,
    pub collateral_seized: u64,
}

#[event]
pub struct EmergencyFreeze {
    pub authority: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}
```

```
Frontend подписывается через WebSocket:
  connection.onLogs(programId, (log) => {
    // парсим event → обновляем дашборд мгновенно
    // AiParametersUpdated → показать новые параметры + reasoning
    // DepositEvent → обновить Total Pool
    // LiquidationEvent → алерт
  })
```

### 14.4 Protocol Mood — "живой" индикатор (из ai_dynamic_nft)

```
ПАТТЕРН: dynamic_nft маппит рыночные данные на "настроение" NFT:
  price_change > +5% → Euphoric
  price_change > +2% → Happy
  price_change < -5% → Panicking

БЕРЁМ: Protocol Mood — визуальный индикатор состояния протокола
```

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ProtocolMood {
    Thriving,     // утилизация 60-80%, low risk, стабильный рост
    Calm,         // утилизация 40-60%, low risk, боковик
    Cautious,     // risk medium, волатильность растёт
    Defensive,    // risk high, AI поднял залог
    Emergency,    // risk critical, AI на максимальной защите
}

// Добавляем в LendingPool:
pub current_mood: ProtocolMood,
```

```
Дашборд показывает:

  ┌────────────────────────────────┐
  │ Protocol Mood: 🟢 Thriving     │
  │ "Рынок стабилен, ставка       │
  │  оптимальна, ликвидность OK"  │
  └────────────────────────────────┘

  или:

  ┌────────────────────────────────┐
  │ Protocol Mood: 🔴 Defensive    │
  │ "AI повысил залог из-за       │
  │  волатильности, будьте        │
  │  осторожны с займами"          │
  └────────────────────────────────┘

Зачем:
├── UX: пользователь МГНОВЕННО понимает состояние протокола
├── Innovation: ни один DeFi протокол так не делает
├── Demo: визуально эффектно (смена цвета при изменении рынка)
└── Вдохновлено: Mood enum из ai_dynamic_nft
```

### 14.5 User Loyalty Tiers (из ai_dynamic_nft level/XP system)

```
ПАТТЕРН: dynamic_nft прокачивает NFT с опытом:
  10 updates → level up → rarity повышается
  Common → Uncommon → Rare → Epic → Legendary

БЕРЁМ: Лендеры и заёмщики получают "лояльность":
```

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum LoyaltyTier {
    Bronze,     // 0-30 дней
    Silver,     // 30-90 дней
    Gold,       // 90-180 дней
    Platinum,   // 180+ дней
}

// Добавляем в UserPosition:
pub struct UserPosition {
    // ... существующие поля ...
    pub first_deposit_at: i64,        // когда первый раз положил
    pub loyalty_tier: LoyaltyTier,    // уровень лояльности
    pub total_interest_earned: u64,   // всего заработано процентов
    pub total_operations: u32,        // всего операций
}
```

```
Бонусы по тирам:

  Bronze:   базовые условия
  Silver:   +0.5% к доходности лендера
  Gold:     +1.0% к доходности + сниженный залог для заёмщика
  Platinum: +1.5% к доходности + приоритет при withdraw

Зачем:
├── Product: стимул держать деньги в протоколе
├── Innovation: gamification в DeFi
├── UX: красивые бейджи на дашборде
├── Вдохновлено: Level/Rarity/XP из ai_dynamic_nft
└── Для жюри: "У нас не просто lending, а экосистема с лояльностью"
```

### 14.6 Emergency Appeal (из ai_dispute_resolver)

```
ПАТТЕРН: dispute_resolver позволяет обеим сторонам предоставить
evidence, после чего AI принимает решение.

БЕРЁМ: Механизм "challenge" — пользователь может оспорить решение AI:
```

```rust
pub fn challenge_ai_decision(
    ctx: Context<ChallengeDecision>,
    reason: String,
) -> Result<()> {
    // Любой user с позицией > 1000 aiUSDC может вызвать challenge
    // Challenge НЕ отменяет решение AI — он создаёт запись on-chain
    // Owner протокола может review и вручную скорректировать
    // Это governance-lite: прозрачность + подотчётность AI
}

#[event]
pub struct AiDecisionChallenged {
    pub challenger: Pubkey,
    pub decision_log: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}
```

```
Зачем:
├── Trustless AI: даже AI можно оспорить
├── Прозрачность: все challenge видны on-chain
├── Governance: путь к DAO в будущем
├── Для жюри: "У нас AI подотчётен пользователям"
└── Вдохновлено: dispute mechanism из ai_dispute_resolver
```

---

## 15. Security: ключи, пароли, .env, Docker networking

### 15.1 Принцип: ни одного секрета в git

```
ПРАВИЛО: Все секреты ТОЛЬКО в .env файлах.
         .env файлы ТОЛЬКО в .gitignore.
         В коде и docker-compose — ТОЛЬКО переменные ${VAR_NAME}.

НИКОГДА в git:
├── API ключи (GEMINI_API_KEY, RPC URLs с ключами)
├── Keypair JSON файлы (deployer.json, ai-agent.json)
├── Пароли БД
├── JWT секреты
├── Приватные ключи Solana
└── Любые токены доступа
```

### 15.2 Генерация сильных ключей/паролей

```bash
# Все пароли генерируются криптографически, НИКОГДА не "password123"

# Пароль для PostgreSQL (32 символа, hex)
openssl rand -hex 32
# → e.g. a3f7c2e9d1b4f8a6c3e7d2b5f9a1c4e8d6b3f7a2e5c8d1b4f6a9c2e7d3b8f5

# JWT secret (64 символа)
openssl rand -base64 48
# → e.g. kX9mP2vR7wQ4tY6uN3jK8fL5hG1dS0aE/xCbZmWqJnToRiUpVyAl

# Session secret
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# Solana keypair (уже криптографический, но хранить в .env)
solana-keygen new --outfile /dev/stdout --no-bip39-passphrase | base64
```

### 15.3 Файлы .env

```bash
# ============================================
# ROOT .env (docker-compose уровень)
# ============================================
# docker/.env — НЕ коммитить, в .gitignore

# --- Solana ---
SOLANA_RPC_URL=https://api.devnet.solana.com
DEPLOYER_KEYPAIR_PATH=/app/keys/deployer.json
AI_AGENT_KEYPAIR_PATH=/app/keys/ai-agent.json
PROGRAM_ID=YOUR_PROGRAM_ID_AFTER_DEPLOY
POOL_AUTHORITY=YOUR_POOL_AUTHORITY_PUBKEY

# --- Gemini AI ---
GEMINI_API_KEY=AIzaSy_REPLACE_WITH_REAL_KEY
GEMINI_MODEL=gemini-2.0-flash

# --- PostgreSQL (сильный пароль!) ---
POSTGRES_USER=solana_ai_lend
POSTGRES_PASSWORD=a3f7c2e9d1b4f8a6c3e7d2b5f9a1c4e8
POSTGRES_DB=solana_ai_lend
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# --- Backend ---
JWT_SECRET=kX9mP2vR7wQ4tY6uN3jK8fL5hG1dS0aE_xCbZmWqJnToRiUpVyAl
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
BACKEND_PORT=8000

# --- Frontend ---
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/updates
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_PROGRAM_ID=${PROGRAM_ID}
```

```bash
# ============================================
# .env.example (коммитить в git — без реальных значений)
# ============================================

# --- Solana ---
SOLANA_RPC_URL=https://api.devnet.solana.com
DEPLOYER_KEYPAIR_PATH=./keys/deployer.json
AI_AGENT_KEYPAIR_PATH=./keys/ai-agent.json
PROGRAM_ID=REPLACE_ME
POOL_AUTHORITY=REPLACE_ME

# --- Gemini AI ---
GEMINI_API_KEY=REPLACE_ME
GEMINI_MODEL=gemini-2.0-flash

# --- PostgreSQL ---
POSTGRES_USER=solana_ai_lend
POSTGRES_PASSWORD=GENERATE_WITH_openssl_rand_-hex_32
POSTGRES_DB=solana_ai_lend
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# --- Backend ---
JWT_SECRET=GENERATE_WITH_openssl_rand_-base64_48
CORS_ORIGINS=http://localhost:5173
BACKEND_PORT=8000

# --- Frontend ---
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/updates
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_PROGRAM_ID=REPLACE_ME
```

### 15.4 Docker Compose — секреты через .env, сервисы на 127.0.0.1

```yaml
# docker/docker-compose.yml
version: "3.9"

services:
  # ========================================
  # PostgreSQL — ТОЛЬКО внутренняя сеть
  # 127.0.0.1 = доступен только с хоста, НЕ из интернета
  # ========================================
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}           # из .env
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}   # из .env (сильный!)
      POSTGRES_DB: ${POSTGRES_DB}               # из .env
    ports:
      - "127.0.0.1:5432:5432"   # ТОЛЬКО localhost, НЕ 0.0.0.0
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - internal

  # ========================================
  # Redis (кэш + pub/sub для WebSocket)
  # ТОЛЬКО внутренняя сеть
  # ========================================
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD:-default_change_me}
      --maxmemory 128mb
      --maxmemory-policy allkeys-lru
    ports:
      - "127.0.0.1:6379:6379"   # ТОЛЬКО localhost
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-default_change_me}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - internal

  # ========================================
  # FastAPI Backend
  # ========================================
  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-default_change_me}@redis:6379/0
      - SOLANA_RPC_URL=${SOLANA_RPC_URL}
      - PROGRAM_ID=${PROGRAM_ID}
      - POOL_AUTHORITY=${POOL_AUTHORITY}
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGINS=${CORS_ORIGINS}
      - GEMINI_API_KEY=${GEMINI_API_KEY}   # для health check Gemini
    ports:
      - "127.0.0.1:8000:8000"   # ТОЛЬКО localhost (nginx проксирует наружу)
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - internal

  # ========================================
  # AI Agent (Python async + multiprocessing)
  # ========================================
  ai-agent:
    build:
      context: ../ai-agent
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - SOLANA_RPC_URL=${SOLANA_RPC_URL}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - GEMINI_MODEL=${GEMINI_MODEL}
      - AI_AGENT_KEYPAIR_PATH=${AI_AGENT_KEYPAIR_PATH}
      - PROGRAM_ID=${PROGRAM_ID}
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-default_change_me}@redis:6379/0
    volumes:
      - ../keys:/app/keys:ro     # keypairs read-only
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - internal
    # НЕТ ports — AI agent не принимает входящих подключений

  # ========================================
  # Frontend (React + Vite → production build)
  # ========================================
  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: ${VITE_API_URL}
        VITE_WS_URL: ${VITE_WS_URL}
        VITE_SOLANA_RPC: ${VITE_SOLANA_RPC}
        VITE_PROGRAM_ID: ${VITE_PROGRAM_ID}
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:80"     # ТОЛЬКО localhost (nginx проксирует)
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - internal

  # ========================================
  # Nginx reverse proxy (единственный сервис наружу)
  # ========================================
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "0.0.0.0:80:80"         # ← единственный порт наружу
      - "0.0.0.0:443:443"       # ← HTTPS (если есть сертификат)
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - frontend
      - backend
    networks:
      - internal

volumes:
  pgdata:

networks:
  internal:
    driver: bridge
    # Все сервисы общаются через internal network
    # Снаружи доступен ТОЛЬКО nginx (80/443)
```

### 15.5 Networking — кто куда ходит

```
ИНТЕРНЕТ
    │
    ▼ (0.0.0.0:80/443 — единственная точка входа)
┌───────────┐
│   Nginx   │ ← reverse proxy
└─┬─────┬───┘
  │     │
  │     │ 127.0.0.1:3000
  │     ▼
  │  ┌──────────┐
  │  │ Frontend  │ ← static files (React build)
  │  └──────────┘
  │
  │ 127.0.0.1:8000
  ▼
┌──────────┐
│ Backend  │ ← FastAPI (REST + WebSocket)
└─┬────┬───┘
  │    │
  │    │ internal:5432
  │    ▼
  │  ┌────┐
  │  │ DB │ ← PostgreSQL (127.0.0.1:5432 с хоста)
  │  └────┘
  │
  │ internal:6379
  ▼
┌───────┐
│ Redis │ ← кэш + pub/sub (127.0.0.1:6379 с хоста)
└───────┘

┌───────────┐
│ AI Agent  │ ← БЕЗ портов наружу, только исходящие:
└─┬─┬─┬─────┘   → DB (internal), → Solana RPC, → Gemini API, → Redis
  │ │ │
  │ │ └── Gemini API (HTTPS outbound)
  │ └──── Solana devnet RPC (HTTPS outbound)
  └────── CoinGecko / Jupiter / Pyth (HTTPS outbound)

ПРАВИЛА:
├── Из интернета доступен ТОЛЬКО nginx (80/443)
├── DB, Redis — 127.0.0.1 (с хоста для отладки) + internal (из контейнеров)
├── Backend, Frontend — 127.0.0.1 (nginx проксирует)
├── AI Agent — НЕТ портов, только outbound
└── Все пароли из .env, НИЧЕГО захардкожено
```

### 15.6 Nginx конфиг (минимальный)

```nginx
# docker/nginx.conf
events { worker_connections 1024; }

http {
    upstream backend {
        server backend:8000;
    }
    upstream frontend {
        server frontend:80;
    }

    server {
        listen 80;
        server_name _;

        # Frontend
        location / {
            proxy_pass http://frontend;
        }

        # Backend API
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # WebSocket
        location /ws/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_read_timeout 86400;
        }
    }
}
```

### 15.7 .gitignore обновление для секретов

```gitignore
# Секреты — НИКОГДА не коммитить
.env
.env.local
.env.production
.env.*.local
docker/.env

# Keypairs
keys/
*.keypair
*-keypair.json
deployer.json
ai-agent.json

# Docker volumes
pgdata/

# SSL сертификаты
*.pem
*.key
*.crt
```

### 15.8 Чеклист безопасности перед деплоем

```
Перед push / deploy проверить:

□ git log --all --diff-filter=A -- '*.env' '*.json' 'keys/' — нет секретов в истории
□ grep -r "AIzaSy" . --exclude-dir=.git — нет ключей в коде
□ grep -r "password" docker-compose.yml — только ${POSTGRES_PASSWORD}, не хардкод
□ docker compose config — проверить что .env подставляется
□ nmap localhost — открыт только порт 80/443 (nginx)
□ curl localhost:5432 — Connection refused (БД не торчит наружу)
□ curl localhost:6379 — Connection refused (Redis не торчит наружу)
□ curl localhost:8000 — Connection refused (Backend за nginx)
□ Все пароли ≥ 32 символа (openssl rand -hex 32)
□ .env.example в git — с REPLACE_ME, без реальных значений
```

### 14.7 Итог: что взяли

```
Из ai_dispute_resolver:
  ✅ On-chain AI reasoning (краткий текст, не только хеш)
  ✅ Protocol stats (counters on-chain)
  ✅ Event на каждое действие (event-driven frontend)
  ✅ Challenge mechanism (оспаривание решений AI)

Из ai_dynamic_nft:
  ✅ Protocol Mood (визуальный индикатор состояния)
  ✅ Loyalty Tiers (gamification — Bronze/Silver/Gold/Platinum)
  ✅ RiskLevel enum (Low/Medium/High/Critical)

Все паттерны УСИЛИВАЮТ оценки по критериям:
  Innovation (+) — Mood, Loyalty, Challenge = уникальные фичи
  Use of Solana (+) — больше данных on-chain, events, stats
  UX (+) — Mood и Loyalty визуально богаче
  Product (+) — Challenge = подотчётность AI
```
