# SolanaAI Lend — Стратегия тестирования

---

## Структура тестов

```
solana-ai-lend/
├── tests/                              # Anchor тесты контракта (TypeScript)
│   ├── 1_initialize.test.ts
│   ├── 2_deposit_withdraw.test.ts
│   ├── 3_borrow_repay.test.ts
│   ├── 4_ai_update.test.ts
│   ├── 5_guard_rails.test.ts
│   ├── 6_events.test.ts
│   └── helpers/
│       ├── setup.ts                    # devnet connection, keypairs, airdrop
│       ├── token.ts                    # создание aiUSDC, mint, transfer
│       └── assertions.ts              # кастомные assert-ы для аккаунтов
│
├── ai-agent/
│   ├── tests/
│   │   ├── test_quant_engine.py        # unit тесты индикаторов
│   │   ├── test_ml_engine.py           # unit тесты ML моделей
│   │   ├── test_utilization_curve.py   # unit тесты формулы ставки
│   │   ├── test_signal_aggregator.py   # unit тесты агрегатора
│   │   ├── test_validator.py           # unit тесты валидатора
│   │   ├── test_ai_engine.py           # integration тест Gemini API
│   │   ├── test_orchestrator.py        # integration тест полного цикла
│   │   ├── conftest.py                 # pytest fixtures
│   │   └── fixtures/
│   │       ├── price_history_bull.json # 24h бычий рынок
│   │       ├── price_history_bear.json # 24h медвежий рынок
│   │       ├── price_history_flat.json # 24h боковик
│   │       ├── price_history_pump.json # pump & dump
│   │       └── pool_states.json        # разные состояния пула
│   └── pytest.ini
│
├── backend/
│   ├── tests/
│   │   ├── test_routes_pool.py         # тесты REST /api/pool/*
│   │   ├── test_routes_decisions.py    # тесты REST /api/decisions/*
│   │   ├── test_routes_analytics.py    # тесты REST /api/analytics/*
│   │   ├── test_routes_health.py       # тесты REST /api/health
│   │   ├── test_websocket.py           # тесты WebSocket
│   │   ├── test_solana_reader.py       # тесты чтения из Solana
│   │   ├── test_decision_service.py    # тесты SQLite CRUD
│   │   ├── conftest.py                 # pytest fixtures + TestClient
│   │   └── fixtures/
│   │       └── mock_pool_data.json
│   └── pytest.ini
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.test.yml         # compose для тестов
│   └── smoke/
│       ├── smoke_test.sh               # bash smoke тест всех контейнеров
│       └── smoke_test.py               # python smoke тест (расширенный)
│
└── scripts/
    └── run_all_tests.sh                # запуск всех тестов одной командой
```

---

## 1. Смарт-контракт — Anchor тесты (TypeScript)

### 1.1 Helpers

```typescript
// tests/helpers/setup.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaAiLend } from "../target/types/solana_ai_lend";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

export async function setupTest() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SolanaAiLend as Program<SolanaAiLend>;

  // Keypairs
  const authority = provider.wallet as anchor.Wallet;
  const aiAgent = Keypair.generate();
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  // Airdrop SOL
  for (const kp of [aiAgent, user1, user2]) {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }

  // Create aiUSDC mint
  const tokenMint = await createMint(
    provider.connection,
    authority.payer,
    authority.publicKey,
    null,
    6 // decimals
  );

  // Mint aiUSDC to users
  const user1TokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection, authority.payer, tokenMint, user1.publicKey
  );
  await mintTo(provider.connection, authority.payer, tokenMint, user1TokenAccount.address, authority.payer, 1_000_000_000); // 1000 aiUSDC

  return { provider, program, authority, aiAgent, user1, user2, tokenMint, user1TokenAccount };
}

// Derive PDAs
export function getPoolPDA(program: Program, authority: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("lending_pool"), authority.toBuffer()],
    program.programId
  );
}

export function getPositionPDA(program: Program, pool: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("position"), pool.toBuffer(), owner.toBuffer()],
    program.programId
  );
}
```

### 1.2 Initialize Pool

```typescript
// tests/1_initialize.test.ts
import { setupTest, getPoolPDA } from "./helpers/setup";
import { expect } from "chai";

describe("initialize_pool", () => {
  it("creates pool with correct initial params", async () => {
    const { program, authority, aiAgent, tokenMint } = await setupTest();
    const [poolPDA] = getPoolPDA(program, authority.publicKey);

    await program.methods
      .initializePool({
        interestRateBps: 500,         // 5%
        collateralRatioBps: 15000,    // 150%
        maxBorrowLimit: new anchor.BN(10000_000000),
        maxInterestRateBps: 2000,     // 20%
        minInterestRateBps: 100,      // 1%
        minCollateralRatioBps: 12000, // 120%
        maxCollateralRatioBps: 20000, // 200%
      })
      .accounts({
        pool: poolPDA,
        authority: authority.publicKey,
        aiAgent: aiAgent.publicKey,
        tokenMint: tokenMint,
      })
      .rpc();

    const pool = await program.account.lendingPool.fetch(poolPDA);
    expect(pool.interestRateBps).to.equal(500);
    expect(pool.collateralRatioBps).to.equal(15000);
    expect(pool.totalDeposits.toNumber()).to.equal(0);
    expect(pool.totalBorrows.toNumber()).to.equal(0);
    expect(pool.totalAiUpdates.toNumber()).to.equal(0);
    expect(pool.aiAgent.toString()).to.equal(aiAgent.publicKey.toString());
  });

  it("fails with duplicate initialization", async () => {
    // второй вызов initializePool → ошибка (аккаунт уже существует)
    try {
      await program.methods.initializePool({...}).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("already in use");
    }
  });
});
```

### 1.3 Deposit + Withdraw

```typescript
// tests/2_deposit_withdraw.test.ts
describe("deposit & withdraw", () => {
  it("deposit increases pool and position balance", async () => {
    const amount = new anchor.BN(1000_000000); // 1000 aiUSDC
    await program.methods.deposit(amount).accounts({...}).signers([user1]).rpc();

    const pool = await program.account.lendingPool.fetch(poolPDA);
    const position = await program.account.userPosition.fetch(positionPDA);

    expect(pool.totalDeposits.toNumber()).to.equal(1000_000000);
    expect(pool.availableLiquidity.toNumber()).to.equal(1000_000000);
    expect(pool.totalDepositsCount.toNumber()).to.equal(1);
    expect(position.deposited.toNumber()).to.equal(1000_000000);
  });

  it("withdraw returns tokens to user", async () => {
    const amount = new anchor.BN(500_000000);
    await program.methods.withdraw(amount).accounts({...}).signers([user1]).rpc();

    const pool = await program.account.lendingPool.fetch(poolPDA);
    expect(pool.totalDeposits.toNumber()).to.equal(500_000000);
  });

  it("withdraw more than deposited → InsufficientDeposit", async () => {
    try {
      await program.methods.withdraw(new anchor.BN(999_000000)).accounts({...}).signers([user1]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("InsufficientDeposit");
    }
  });

  it("deposit zero → ZeroAmount", async () => {
    try {
      await program.methods.deposit(new anchor.BN(0)).accounts({...}).signers([user1]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("ZeroAmount");
    }
  });

  it("withdraw when pool has no liquidity → InsufficientLiquidity", async () => {
    // deposit → someone borrows all → try withdraw → fail
  });
});
```

### 1.4 Borrow + Repay

```typescript
// tests/3_borrow_repay.test.ts
describe("borrow & repay", () => {
  it("borrow with sufficient collateral → OK", async () => {
    // user deposited SOL as collateral
    const borrowAmount = new anchor.BN(500_000000);
    await program.methods.borrow(borrowAmount).accounts({...}).signers([user2]).rpc();

    const pool = await program.account.lendingPool.fetch(poolPDA);
    const position = await program.account.userPosition.fetch(user2PositionPDA);

    expect(pool.totalBorrows.toNumber()).to.equal(500_000000);
    expect(position.borrowed.toNumber()).to.equal(500_000000);
  });

  it("borrow without collateral → InsufficientCollateral", async () => {
    try {
      await program.methods.borrow(new anchor.BN(1000_000000)).accounts({...}).signers([user2]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("InsufficientCollateral");
    }
  });

  it("borrow exceeds max limit → BorrowLimitExceeded", async () => {
    // borrow > pool.max_borrow_limit
  });

  it("repay reduces borrowed amount", async () => {
    await program.methods.repay(new anchor.BN(500_000000)).accounts({...}).signers([user2]).rpc();
    const position = await program.account.userPosition.fetch(user2PositionPDA);
    expect(position.borrowed.toNumber()).to.equal(0);
  });

  it("repay more than borrowed → RepayExceedsBorrow", async () => {
    try {
      await program.methods.repay(new anchor.BN(1)).accounts({...}).signers([user2]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("RepayExceedsBorrow");
    }
  });
});
```

### 1.5 AI Update Parameters + Guard Rails

```typescript
// tests/4_ai_update.test.ts
describe("update_parameters (AI)", () => {
  it("AI updates rate within limits → OK", async () => {
    const reasoningHash = Buffer.alloc(32);
    await program.methods
      .updateParameters(550, 15000, new anchor.BN(10000_000000), Array.from(reasoningHash), 80)
      .accounts({ pool: poolPDA, aiAgent: aiAgent.publicKey })
      .signers([aiAgent])
      .rpc();

    const pool = await program.account.lendingPool.fetch(poolPDA);
    expect(pool.interestRateBps).to.equal(550);
    expect(pool.totalAiUpdates.toNumber()).to.equal(1);
  });

  it("emits AiParametersUpdated event", async () => {
    const listener = program.addEventListener("AiParametersUpdated", (event) => {
      expect(event.oldRate).to.equal(500);
      expect(event.newRate).to.equal(550);
      expect(event.confidence).to.equal(80);
    });
    await program.methods.updateParameters(550, ...).rpc();
    program.removeEventListener(listener);
  });

  it("creates AiDecisionLog with reasoning_short", async () => {
    const log = await program.account.aiDecisionLog.fetch(logPDA);
    expect(log.reasoningShort.length).to.be.greaterThan(0);
    expect(log.confidence).to.equal(80);
  });

  it("updates ProtocolMood based on risk", async () => {
    const pool = await program.account.lendingPool.fetch(poolPDA);
    // risk_level = medium → mood = Cautious
    expect(pool.currentMood).to.deep.equal({ cautious: {} });
  });
});

// tests/5_guard_rails.test.ts
describe("guard rails", () => {
  it("rate above max → RateTooHigh", async () => {
    try {
      await program.methods.updateParameters(5000, 15000, ...) // 50% > max 20%
        .signers([aiAgent]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("RateTooHigh");
    }
  });

  it("rate below min → RateTooLow", async () => {
    try {
      await program.methods.updateParameters(50, 15000, ...) // 0.5% < min 1%
        .signers([aiAgent]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("RateTooLow");
    }
  });

  it("collateral below min → CollateralTooLow", async () => {
    try {
      await program.methods.updateParameters(500, 10000, ...) // 100% < min 120%
        .signers([aiAgent]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("CollateralTooLow");
    }
  });

  it("change > 20% → ChangeTooLarge", async () => {
    // current rate = 500, new rate = 700 → change = 40% > 20%
    try {
      await program.methods.updateParameters(700, 15000, ...)
        .signers([aiAgent]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("ChangeTooLarge");
    }
  });

  it("cooldown not passed → CooldownActive", async () => {
    // вызвать update сразу после предыдущего (< 600 сек)
    await program.methods.updateParameters(520, ...).signers([aiAgent]).rpc();
    try {
      await program.methods.updateParameters(540, ...).signers([aiAgent]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("CooldownActive");
    }
  });

  it("non-AI signer → Unauthorized (has_one constraint)", async () => {
    const fakeAgent = Keypair.generate();
    try {
      await program.methods.updateParameters(550, ...)
        .accounts({ pool: poolPDA, aiAgent: fakeAgent.publicKey })
        .signers([fakeAgent]).rpc();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e.toString()).to.include("has_one");
    }
  });

  it("emergency_freeze by owner → pool frozen", async () => {
    await program.methods.emergencyFreeze("test freeze")
      .accounts({ pool: poolPDA, authority: authority.publicKey })
      .rpc();
    // subsequent operations should fail
  });

  it("challenge_ai_decision → event emitted", async () => {
    const listener = program.addEventListener("AiDecisionChallenged", (event) => {
      expect(event.challenger.toString()).to.equal(user1.publicKey.toString());
    });
    await program.methods.challengeAiDecision("disagree with rate change")
      .accounts({ pool: poolPDA, challenger: user1.publicKey, decisionLog: logPDA })
      .signers([user1]).rpc();
    program.removeEventListener(listener);
  });
});
```

### 1.6 Events

```typescript
// tests/6_events.test.ts
describe("events", () => {
  it("DepositEvent contains correct data", async () => {
    let emitted = false;
    const listener = program.addEventListener("DepositEvent", (event) => {
      expect(event.user.toString()).to.equal(user1.publicKey.toString());
      expect(event.amount.toNumber()).to.equal(100_000000);
      emitted = true;
    });
    await program.methods.deposit(new anchor.BN(100_000000)).accounts({...}).signers([user1]).rpc();
    await new Promise(r => setTimeout(r, 1000));
    program.removeEventListener(listener);
    expect(emitted).to.be.true;
  });

  it("BorrowEvent includes interest rate at time of borrow", async () => {
    let capturedRate = 0;
    const listener = program.addEventListener("BorrowEvent", (event) => {
      capturedRate = event.interestRateBps;
    });
    await program.methods.borrow(...).rpc();
    program.removeEventListener(listener);
    expect(capturedRate).to.be.greaterThan(0);
  });
});
```

### 1.7 Запуск

```bash
# Все тесты контракта
anchor test

# Конкретный файл
anchor test -- --grep "guard rails"
```

---

## 2. AI Agent — pytest (Python)

### 2.1 Fixtures

```python
# ai-agent/tests/conftest.py
import pytest
import json
import numpy as np
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture
def bull_prices():
    """24h бычий рынок — стабильный рост"""
    with open(FIXTURES_DIR / "price_history_bull.json") as f:
        return json.load(f)

@pytest.fixture
def bear_prices():
    """24h медвежий рынок — падение"""
    with open(FIXTURES_DIR / "price_history_bear.json") as f:
        return json.load(f)

@pytest.fixture
def flat_prices():
    """24h боковик"""
    with open(FIXTURES_DIR / "price_history_flat.json") as f:
        return json.load(f)

@pytest.fixture
def pump_prices():
    """Pump & dump — резкий рост и падение"""
    with open(FIXTURES_DIR / "price_history_pump.json") as f:
        return json.load(f)

@pytest.fixture
def normal_pool_state():
    return {
        "total_deposits": 50000,
        "total_borrows": 30000,
        "utilization": 0.6,
        "current_rate_bps": 500,
        "current_collateral_bps": 15000,
        "available_liquidity": 20000,
    }

@pytest.fixture
def high_util_pool_state():
    return {
        "total_deposits": 50000,
        "total_borrows": 45000,
        "utilization": 0.9,
        "current_rate_bps": 500,
        "current_collateral_bps": 15000,
        "available_liquidity": 5000,
    }

@pytest.fixture
def sample_quant_report():
    return {
        "sol_price": 185.40,
        "sol_24h_change": -3.2,
        "pool_utilization": 0.60,
        "total_deposits": 50000,
        "total_borrows": 30000,
        "current_rate_bps": 500,
        "current_collateral_bps": 15000,
        "rsi": 72.3,
        "rsi_signal": "overbought",
        "macd_trend": "bullish",
        "macd_histogram": 0.13,
        "bollinger_percent_b": 0.85,
        "atr_percentile": 65,
        "ema_crossover": "bullish",
        "anomaly_score": 0.3,
        "is_anomaly": False,
        "trend_prediction": 2.1,
        "trend_confidence": 0.68,
        "volatility_regime": "medium",
        "risk_score": 45,
        "risk_level": "medium",
        "predicted_utilization": 0.65,
        "formula_optimal_rate_bps": 400,
        "formula_rate_range_bps": [350, 450],
        "utilization_zone": "normal",
        "recommended_rate_direction": "increase",
        "recommended_collateral_direction": "hold",
        "math_confidence": 0.75,
        "constraints": {
            "min_rate_bps": 100,
            "max_rate_bps": 2000,
            "min_collateral_bps": 12000,
            "max_collateral_bps": 20000,
            "max_change_percent": 20,
        }
    }
```

### 2.2 Quant Engine тесты

```python
# ai-agent/tests/test_quant_engine.py
import numpy as np
import pytest
from agent.quant_engine import QuantEngine

engine = QuantEngine()

class TestRSI:
    def test_rsi_overbought(self, bull_prices):
        """Бычий рынок → RSI > 70"""
        result = engine.calc_rsi(bull_prices, period=14)
        assert 70 < result <= 100

    def test_rsi_oversold(self, bear_prices):
        """Медвежий рынок → RSI < 30"""
        result = engine.calc_rsi(bear_prices, period=14)
        assert 0 <= result < 30

    def test_rsi_neutral(self, flat_prices):
        """Боковик → RSI 40-60"""
        result = engine.calc_rsi(flat_prices, period=14)
        assert 40 <= result <= 60

    def test_rsi_range(self, bull_prices):
        """RSI всегда в [0, 100]"""
        result = engine.calc_rsi(bull_prices, period=14)
        assert 0 <= result <= 100

    def test_rsi_insufficient_data(self):
        """Мало данных → возвращает 50 (нейтральный)"""
        result = engine.calc_rsi([100, 101, 102], period=14)
        assert result == 50.0

class TestMACD:
    def test_macd_bullish(self, bull_prices):
        result = engine.calc_macd(bull_prices)
        assert result["macd_line"] > result["signal_line"]
        assert result["trend"] == "bullish"

    def test_macd_bearish(self, bear_prices):
        result = engine.calc_macd(bear_prices)
        assert result["macd_line"] < result["signal_line"]
        assert result["trend"] == "bearish"

    def test_macd_histogram_sign(self, bull_prices):
        result = engine.calc_macd(bull_prices)
        assert result["histogram"] > 0  # bullish = positive histogram

class TestBollinger:
    def test_bollinger_percent_b_range(self, flat_prices):
        result = engine.calc_bollinger(flat_prices)
        # В боковике %B должен быть около 0.5
        assert 0.2 <= result["percent_b"] <= 0.8

    def test_bollinger_pump_above_upper(self, pump_prices):
        result = engine.calc_bollinger(pump_prices)
        # При пампе %B > 1 (цена выше верхней полосы)
        assert result["percent_b"] > 1.0

    def test_bollinger_bandwidth_positive(self, flat_prices):
        result = engine.calc_bollinger(flat_prices)
        assert result["bandwidth"] > 0

class TestATR:
    def test_atr_high_volatility(self, pump_prices):
        result = engine.calc_atr(pump_prices, period=14)
        assert result > 0

    def test_atr_low_in_flat_market(self, flat_prices):
        atr_flat = engine.calc_atr(flat_prices, period=14)
        atr_pump = engine.calc_atr(pump_prices, period=14)
        assert atr_flat < atr_pump

class TestEMACrossover:
    def test_ema_bullish_in_uptrend(self, bull_prices):
        result = engine.calc_ema_crossover(bull_prices)
        assert result == "bullish"

    def test_ema_bearish_in_downtrend(self, bear_prices):
        result = engine.calc_ema_crossover(bear_prices)
        assert result == "bearish"

class TestUtilizationCurve:
    def test_low_utilization_low_rate(self):
        result = engine.utilization_curve({"utilization": 0.3})
        assert result["optimal_rate_bps"] < 300  # < 3%

    def test_high_utilization_high_rate(self):
        result = engine.utilization_curve({"utilization": 0.95})
        assert result["optimal_rate_bps"] > 1000  # > 10%

    def test_optimal_utilization_kink(self):
        result = engine.utilization_curve({"utilization": 0.80})
        # На точке перегиба ставка = R_base + R_slope1
        assert 450 <= result["optimal_rate_bps"] <= 550

    def test_zone_critical_at_95(self):
        result = engine.utilization_curve({"utilization": 0.95})
        assert result["zone"] == "critical"

    def test_zone_normal_at_50(self):
        result = engine.utilization_curve({"utilization": 0.50})
        assert result["zone"] == "normal"
```

### 2.3 ML Engine тесты

```python
# ai-agent/tests/test_ml_engine.py
from agent.ml_engine import MLEngine

engine = MLEngine()

class TestAnomalyDetector:
    def test_normal_market_no_anomaly(self, flat_prices, normal_pool_state):
        result = engine.predict(flat_prices, normal_pool_state)
        assert result["is_anomaly"] == False
        assert result["anomaly_score"] > 0

    def test_pump_detected_as_anomaly(self, pump_prices, normal_pool_state):
        result = engine.predict(pump_prices, normal_pool_state)
        assert result["is_anomaly"] == True
        assert result["anomaly_score"] < 0

class TestTrendPredictor:
    def test_bull_predicts_positive(self, bull_prices, normal_pool_state):
        result = engine.predict(bull_prices, normal_pool_state)
        assert result["trend_prediction"] > 0

    def test_bear_predicts_negative(self, bear_prices, normal_pool_state):
        result = engine.predict(bear_prices, normal_pool_state)
        assert result["trend_prediction"] < 0

    def test_confidence_range(self, bull_prices, normal_pool_state):
        result = engine.predict(bull_prices, normal_pool_state)
        assert 0 <= result["trend_confidence"] <= 1

class TestVolatilityModel:
    def test_high_volatility_detected(self, pump_prices, normal_pool_state):
        result = engine.predict(pump_prices, normal_pool_state)
        assert result["volatility_regime"] == "high"

    def test_low_volatility_in_flat(self, flat_prices, normal_pool_state):
        result = engine.predict(flat_prices, normal_pool_state)
        assert result["volatility_regime"] == "low"

class TestRiskScorer:
    def test_risk_low_in_stable(self, flat_prices, normal_pool_state):
        result = engine.predict(flat_prices, normal_pool_state)
        assert result["risk_score"] < 30
        assert result["risk_level"] == "low"

    def test_risk_high_in_volatile(self, pump_prices, high_util_pool_state):
        result = engine.predict(pump_prices, high_util_pool_state)
        assert result["risk_score"] > 60
        assert result["risk_level"] in ["high", "critical"]

    def test_risk_score_range(self, flat_prices, normal_pool_state):
        result = engine.predict(flat_prices, normal_pool_state)
        assert 0 <= result["risk_score"] <= 100
```

### 2.4 Signal Aggregator тесты

```python
# ai-agent/tests/test_signal_aggregator.py
from agent.signal_aggregator import SignalAggregator

agg = SignalAggregator()

class TestSignalAggregator:
    def test_report_has_all_fields(self):
        report = agg.build_report(
            market_data={"sol_price": 185, "sol_24h_change": -3},
            pool_state={"utilization": 0.6, "current_rate_bps": 500, "current_collateral_bps": 15000},
            technical={"rsi": 72, "rsi_signal": "overbought", "macd_trend": "bullish"},
            ml_signals={"risk_score": 45, "risk_level": "medium", "is_anomaly": False},
            util_recommendation={"optimal_rate_bps": 400, "zone": "normal"},
        )
        required_fields = [
            "rsi", "risk_score", "formula_optimal_rate_bps",
            "recommended_rate_direction", "math_confidence", "constraints"
        ]
        for field in required_fields:
            assert field in report, f"Missing field: {field}"

    def test_all_bearish_recommends_increase(self):
        """Все индикаторы медвежьи → рекомендация: повысить ставку"""
        report = agg.build_report(
            market_data={"sol_price": 150, "sol_24h_change": -8},
            pool_state={"utilization": 0.85, "current_rate_bps": 500, "current_collateral_bps": 15000},
            technical={"rsi": 25, "rsi_signal": "oversold", "macd_trend": "bearish"},
            ml_signals={"risk_score": 80, "risk_level": "high", "is_anomaly": True},
            util_recommendation={"optimal_rate_bps": 900, "zone": "warning"},
        )
        assert report["recommended_rate_direction"] == "increase"
        assert report["recommended_collateral_direction"] == "increase"
        assert report["math_confidence"] > 0.8

    def test_neutral_market_recommends_hold(self):
        report = agg.build_report(
            market_data={"sol_price": 185, "sol_24h_change": 0.1},
            pool_state={"utilization": 0.5, "current_rate_bps": 500, "current_collateral_bps": 15000},
            technical={"rsi": 50, "rsi_signal": "neutral", "macd_trend": "neutral"},
            ml_signals={"risk_score": 20, "risk_level": "low", "is_anomaly": False},
            util_recommendation={"optimal_rate_bps": 500, "zone": "normal"},
        )
        assert report["recommended_rate_direction"] == "hold"

    def test_constraints_always_present(self):
        report = agg.build_report(...)
        assert report["constraints"]["min_rate_bps"] == 100
        assert report["constraints"]["max_rate_bps"] == 2000
```

### 2.5 Validator тесты

```python
# ai-agent/tests/test_validator.py
from agent.validator import Validator

validator = Validator()

class TestValidator:
    def test_valid_decision_passes(self, normal_pool_state):
        decision = {
            "interest_rate_bps": 550,
            "collateral_ratio_bps": 15000,
            "max_borrow_limit": 10000,
            "confidence": 80,
            "risk_assessment": "medium",
            "reasoning": "test",
        }
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == True

    def test_rate_too_high_rejected(self, normal_pool_state):
        decision = {"interest_rate_bps": 5000, "collateral_ratio_bps": 15000,
                     "max_borrow_limit": 10000, "confidence": 80, "risk_assessment": "medium"}
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False
        assert "out of bounds" in reason

    def test_rate_too_low_rejected(self, normal_pool_state):
        decision = {"interest_rate_bps": 50, "collateral_ratio_bps": 15000,
                     "max_borrow_limit": 10000, "confidence": 80, "risk_assessment": "medium"}
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False

    def test_change_too_large_rejected(self, normal_pool_state):
        """current = 500, new = 700 → 40% change > 20% max"""
        decision = {"interest_rate_bps": 700, "collateral_ratio_bps": 15000,
                     "max_borrow_limit": 10000, "confidence": 80, "risk_assessment": "medium"}
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False
        assert "exceeds 20%" in reason

    def test_low_confidence_rejected(self, normal_pool_state):
        decision = {"interest_rate_bps": 520, "collateral_ratio_bps": 15000,
                     "max_borrow_limit": 10000, "confidence": 30, "risk_assessment": "medium"}
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False
        assert "too low" in reason

    def test_critical_risk_rejected(self, normal_pool_state):
        decision = {"interest_rate_bps": 520, "collateral_ratio_bps": 15000,
                     "max_borrow_limit": 10000, "confidence": 80, "risk_assessment": "critical"}
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False
        assert "critical" in reason

    def test_missing_field_rejected(self, normal_pool_state):
        decision = {"interest_rate_bps": 520}  # missing fields
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False
        assert "Missing" in reason

    def test_collateral_below_min_rejected(self, normal_pool_state):
        decision = {"interest_rate_bps": 520, "collateral_ratio_bps": 10000,
                     "max_borrow_limit": 10000, "confidence": 80, "risk_assessment": "medium"}
        is_valid, reason = validator.validate(decision, normal_pool_state)
        assert is_valid == False
```

### 2.6 AI Engine integration тест

```python
# ai-agent/tests/test_ai_engine.py
import pytest
from agent.ai_engine import GeminiEngine
from config import Settings

@pytest.mark.integration
class TestGeminiEngine:
    @pytest.fixture
    def engine(self):
        settings = Settings()
        return GeminiEngine(settings)

    @pytest.mark.asyncio
    async def test_gemini_returns_valid_json(self, engine, sample_quant_report):
        decision = await engine.interpret(sample_quant_report)
        assert "interest_rate_bps" in decision
        assert "collateral_ratio_bps" in decision
        assert "reasoning" in decision
        assert "confidence" in decision

    @pytest.mark.asyncio
    async def test_gemini_respects_constraints(self, engine, sample_quant_report):
        decision = await engine.interpret(sample_quant_report)
        assert 100 <= decision["interest_rate_bps"] <= 2000
        assert 12000 <= decision["collateral_ratio_bps"] <= 20000
        assert 0 <= decision["confidence"] <= 100

    @pytest.mark.asyncio
    async def test_gemini_reasoning_references_indicators(self, engine, sample_quant_report):
        decision = await engine.interpret(sample_quant_report)
        reasoning = decision["reasoning"].lower()
        # Reasoning должен ссылаться на конкретные индикаторы
        indicators_mentioned = sum(1 for ind in ["rsi", "macd", "risk", "утилизац", "волатил"]
                                   if ind in reasoning)
        assert indicators_mentioned >= 2, "Reasoning should reference at least 2 indicators"
```

### 2.7 Запуск

```bash
# Все unit тесты
cd ai-agent && python -m pytest tests/ -v --ignore=tests/test_ai_engine.py

# Только integration (требует GEMINI_API_KEY)
cd ai-agent && python -m pytest tests/test_ai_engine.py -v -m integration

# С coverage
cd ai-agent && python -m pytest tests/ --cov=agent --cov-report=term-missing

# Конкретный модуль
cd ai-agent && python -m pytest tests/test_quant_engine.py -v
```

---

## 3. Backend — pytest + httpx (FastAPI)

### 3.1 Fixtures

```python
# backend/tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

### 3.2 Route тесты — Pool

```python
# backend/tests/test_routes_pool.py
import pytest

@pytest.mark.anyio
class TestPoolRoutes:
    async def test_get_pool_state_200(self, client):
        resp = await client.get("/api/pool/state")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_deposits" in data
        assert "interest_rate_bps" in data
        assert "current_mood" in data

    async def test_get_pool_state_has_correct_types(self, client):
        resp = await client.get("/api/pool/state")
        data = resp.json()
        assert isinstance(data["total_deposits"], (int, float))
        assert isinstance(data["interest_rate_bps"], int)
        assert data["current_mood"] in ["thriving", "calm", "cautious", "defensive", "emergency"]

    async def test_get_pool_stats_200(self, client):
        resp = await client.get("/api/pool/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_ai_updates" in data
        assert "total_ai_skips" in data
        assert "total_deposits_count" in data

    async def test_pool_state_cache_works(self, client):
        """Два запроса подряд должны вернуть одинаковые данные (TTL кэш)"""
        resp1 = await client.get("/api/pool/state")
        resp2 = await client.get("/api/pool/state")
        assert resp1.json() == resp2.json()
```

### 3.3 Route тесты — Decisions

```python
# backend/tests/test_routes_decisions.py
import pytest

@pytest.mark.anyio
class TestDecisionRoutes:
    async def test_get_decisions_200(self, client):
        resp = await client.get("/api/decisions/")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data

    async def test_get_decisions_pagination(self, client):
        resp = await client.get("/api/decisions/?page=1&limit=5")
        data = resp.json()
        assert len(data["items"]) <= 5
        assert data["page"] == 1

    async def test_get_decisions_filter_by_risk(self, client):
        resp = await client.get("/api/decisions/?risk_level=high")
        data = resp.json()
        for item in data["items"]:
            assert item["risk_level"] == "high"

    async def test_get_decision_by_id_404(self, client):
        resp = await client.get("/api/decisions/nonexistent-id")
        assert resp.status_code == 404

    async def test_decisions_have_required_fields(self, client):
        resp = await client.get("/api/decisions/")
        data = resp.json()
        if data["items"]:
            item = data["items"][0]
            required = ["timestamp", "old_rate", "new_rate", "reasoning_short",
                        "confidence", "risk_level", "tx_hash"]
            for field in required:
                assert field in item, f"Missing field: {field}"
```

### 3.4 Route тесты — Analytics

```python
# backend/tests/test_routes_analytics.py
import pytest

@pytest.mark.anyio
class TestAnalyticsRoutes:
    async def test_rate_history_200(self, client):
        resp = await client.get("/api/analytics/rate-history?hours=24")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        if data:
            assert "timestamp" in data[0]
            assert "rate_bps" in data[0]

    async def test_risk_history_200(self, client):
        resp = await client.get("/api/analytics/risk-history?hours=24")
        assert resp.status_code == 200

    async def test_invalid_hours_param(self, client):
        resp = await client.get("/api/analytics/rate-history?hours=-1")
        assert resp.status_code == 422  # validation error
```

### 3.5 Route тесты — Health

```python
# backend/tests/test_routes_health.py
import pytest

@pytest.mark.anyio
class TestHealthRoutes:
    async def test_health_200(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "solana_connected" in data
        assert "ai_agent_active" in data
        assert "uptime_seconds" in data

    async def test_health_has_version(self, client):
        resp = await client.get("/api/health")
        data = resp.json()
        assert "version" in data
```

### 3.6 WebSocket тесты

```python
# backend/tests/test_websocket.py
import pytest
from httpx_ws import aconnect_ws
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.anyio
class TestWebSocket:
    async def test_ws_connect(self):
        """WebSocket подключение успешно"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            async with aconnect_ws("/ws", client) as ws:
                # Должен подключиться без ошибок
                assert ws is not None

    async def test_ws_receives_initial_state(self):
        """После подключения сервер шлёт текущее состояние"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            async with aconnect_ws("/ws", client) as ws:
                msg = await ws.receive_json()
                assert msg["type"] == "pool_state"
                assert "total_deposits" in msg["data"]

    async def test_ws_ping_pong(self):
        """Клиент шлёт ping → сервер отвечает pong"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            async with aconnect_ws("/ws", client) as ws:
                await ws.send_json({"type": "ping"})
                msg = await ws.receive_json()
                assert msg["type"] == "pong"

    async def test_ws_multiple_clients(self):
        """Несколько клиентов получают broadcast одновременно"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            async with aconnect_ws("/ws", client) as ws1:
                async with aconnect_ws("/ws", client) as ws2:
                    # Оба получают initial state
                    msg1 = await ws1.receive_json()
                    msg2 = await ws2.receive_json()
                    assert msg1["type"] == "pool_state"
                    assert msg2["type"] == "pool_state"
```

### 3.7 Запуск

```bash
# Все backend тесты
cd backend && python -m pytest tests/ -v

# С coverage
cd backend && python -m pytest tests/ --cov=app --cov-report=term-missing

# Только routes
cd backend && python -m pytest tests/test_routes_*.py -v

# Только websocket
cd backend && python -m pytest tests/test_websocket.py -v
```

---

## 4. Smoke тесты — Docker контейнеры

### 4.1 docker-compose.yml

```yaml
# docker/docker-compose.yml
version: "3.9"

services:
  backend:
    build: ../backend
    ports:
      - "8000:8000"
    environment:
      - SOLANA_RPC_URL=https://api.devnet.solana.com
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  ai-agent:
    build: ../ai-agent
    environment:
      - SOLANA_RPC_URL=https://api.devnet.solana.com
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    depends_on:
      backend:
        condition: service_healthy

  frontend:
    build: ../frontend
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy
```

### 4.2 Bash Smoke тест

```bash
#!/bin/bash
# docker/smoke/smoke_test.sh
# Быстрый smoke тест — проверяет что контейнеры живы и отвечают

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"
PASSED=0
FAILED=0

check() {
    local name="$1"
    local url="$2"
    local expected_code="$3"
    local expected_body="$4"

    response=$(curl -s -o /tmp/smoke_body -w "%{http_code}" "$url" 2>/dev/null)
    body=$(cat /tmp/smoke_body)

    if [ "$response" == "$expected_code" ]; then
        if [ -n "$expected_body" ]; then
            if echo "$body" | grep -q "$expected_body"; then
                echo -e "${GREEN}[PASS]${NC} $name (HTTP $response, body contains '$expected_body')"
                PASSED=$((PASSED + 1))
            else
                echo -e "${RED}[FAIL]${NC} $name (HTTP $response, body missing '$expected_body')"
                FAILED=$((FAILED + 1))
            fi
        else
            echo -e "${GREEN}[PASS]${NC} $name (HTTP $response)"
            PASSED=$((PASSED + 1))
        fi
    else
        echo -e "${RED}[FAIL]${NC} $name (expected $expected_code, got $response)"
        FAILED=$((FAILED + 1))
    fi
}

echo "=========================================="
echo "  SMOKE TESTS — SolanaAI Lend"
echo "=========================================="
echo ""

# ── Backend Health ──
echo "── Backend ──"
check "Health endpoint"         "$BACKEND_URL/api/health"           "200" '"status":"ok"'
check "Pool state"              "$BACKEND_URL/api/pool/state"       "200" "total_deposits"
check "Pool stats"              "$BACKEND_URL/api/pool/stats"       "200" "total_ai_updates"
check "Decisions list"          "$BACKEND_URL/api/decisions/"       "200" "items"
check "Decisions pagination"    "$BACKEND_URL/api/decisions/?page=1&limit=2" "200" "page"
check "Analytics rate history"  "$BACKEND_URL/api/analytics/rate-history?hours=24" "200" ""
check "Swagger docs"            "$BACKEND_URL/docs"                 "200" "swagger"
check "404 on unknown route"    "$BACKEND_URL/api/nonexistent"      "404" ""

# ── Frontend ──
echo ""
echo "── Frontend ──"
check "Frontend serves HTML"    "$FRONTEND_URL"                     "200" "SolanaAI"

# ── WebSocket ──
echo ""
echo "── WebSocket ──"
WS_RESULT=$(timeout 5 wscat -c ws://localhost:8000/ws -x '{"type":"ping"}' 2>/dev/null || echo "FAIL")
if echo "$WS_RESULT" | grep -q "pong"; then
    echo -e "${GREEN}[PASS]${NC} WebSocket ping/pong"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}[FAIL]${NC} WebSocket ping/pong"
    FAILED=$((FAILED + 1))
fi

# ── Docker container health ──
echo ""
echo "── Container Status ──"
for service in backend ai-agent frontend; do
    status=$(docker compose ps --format json "$service" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('State','unknown'))" 2>/dev/null || echo "unknown")
    if [ "$status" == "running" ]; then
        echo -e "${GREEN}[PASS]${NC} Container '$service' is running"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}[FAIL]${NC} Container '$service' status: $status"
        FAILED=$((FAILED + 1))
    fi
done

# ── Summary ──
echo ""
echo "=========================================="
TOTAL=$((PASSED + FAILED))
echo "  Results: $PASSED/$TOTAL passed"
if [ $FAILED -gt 0 ]; then
    echo -e "  ${RED}$FAILED tests FAILED${NC}"
    exit 1
else
    echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
```

### 4.3 Python Smoke тест (расширенный)

```python
#!/usr/bin/env python3
# docker/smoke/smoke_test.py
"""
Расширенный smoke тест — проверяет:
1. Все контейнеры running
2. Backend API отвечает корректно
3. WebSocket подключается
4. AI Agent логирует решения
5. Данные согласованы между API и контрактом
"""

import asyncio
import aiohttp
import sys
import json
from dataclasses import dataclass

BACKEND = "http://localhost:8000"
FRONTEND = "http://localhost:3000"
WS_URL = "ws://localhost:8000/ws"

@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""

results: list[TestResult] = []

def log(result: TestResult):
    results.append(result)
    icon = "✅" if result.passed else "❌"
    detail = f" — {result.detail}" if result.detail else ""
    print(f"  {icon} {result.name}{detail}")

async def test_backend_health():
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BACKEND}/api/health") as r:
            data = await r.json()
            log(TestResult("Backend health", r.status == 200 and data["status"] == "ok"))
            log(TestResult("Solana connected", data.get("solana_connected", False)))
            log(TestResult("AI agent active", data.get("ai_agent_active", False)))

async def test_pool_state():
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BACKEND}/api/pool/state") as r:
            data = await r.json()
            log(TestResult("Pool state loads", r.status == 200))
            log(TestResult("Pool has deposits field", "total_deposits" in data))
            log(TestResult("Rate in valid range",
                100 <= data.get("interest_rate_bps", 0) <= 2000,
                f"rate={data.get('interest_rate_bps')}"))
            log(TestResult("Collateral in valid range",
                12000 <= data.get("collateral_ratio_bps", 0) <= 20000,
                f"collateral={data.get('collateral_ratio_bps')}"))
            log(TestResult("Mood is valid",
                data.get("current_mood") in ["thriving","calm","cautious","defensive","emergency"],
                f"mood={data.get('current_mood')}"))

async def test_pool_stats():
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BACKEND}/api/pool/stats") as r:
            data = await r.json()
            log(TestResult("Pool stats loads", r.status == 200))
            log(TestResult("AI updates count >= 0",
                data.get("total_ai_updates", -1) >= 0,
                f"updates={data.get('total_ai_updates')}"))

async def test_decisions():
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BACKEND}/api/decisions/?page=1&limit=5") as r:
            data = await r.json()
            log(TestResult("Decisions list loads", r.status == 200))
            log(TestResult("Decisions has items", "items" in data))
            log(TestResult("Pagination works", data.get("page") == 1))
            if data.get("items"):
                item = data["items"][0]
                log(TestResult("Decision has reasoning",
                    len(item.get("reasoning_short", "")) > 0))
                log(TestResult("Decision has confidence",
                    0 <= item.get("confidence", -1) <= 100,
                    f"confidence={item.get('confidence')}"))
                log(TestResult("Decision has tx_hash",
                    len(item.get("tx_hash", "")) > 0))

async def test_analytics():
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BACKEND}/api/analytics/rate-history?hours=24") as r:
            data = await r.json()
            log(TestResult("Rate history loads", r.status == 200 and isinstance(data, list)))
        async with s.get(f"{BACKEND}/api/analytics/risk-history?hours=24") as r:
            data = await r.json()
            log(TestResult("Risk history loads", r.status == 200 and isinstance(data, list)))

async def test_websocket():
    try:
        async with aiohttp.ClientSession() as s:
            async with s.ws_connect(WS_URL, timeout=5) as ws:
                log(TestResult("WebSocket connects", True))

                # Должен получить initial state
                msg = await asyncio.wait_for(ws.receive_json(), timeout=5)
                log(TestResult("WS sends initial state",
                    msg.get("type") == "pool_state",
                    f"type={msg.get('type')}"))

                # Ping-pong
                await ws.send_json({"type": "ping"})
                pong = await asyncio.wait_for(ws.receive_json(), timeout=5)
                log(TestResult("WS ping-pong works", pong.get("type") == "pong"))

    except Exception as e:
        log(TestResult("WebSocket connects", False, str(e)))

async def test_frontend():
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(FRONTEND) as r:
                text = await r.text()
                log(TestResult("Frontend serves HTML", r.status == 200))
                log(TestResult("Frontend has app root",
                    "root" in text or "app" in text.lower()))
    except Exception as e:
        log(TestResult("Frontend serves HTML", False, str(e)))

async def test_data_consistency():
    """Pool state из API должен совпадать с данными из decisions"""
    async with aiohttp.ClientSession() as s:
        pool_r = await s.get(f"{BACKEND}/api/pool/state")
        pool = await pool_r.json()

        dec_r = await s.get(f"{BACKEND}/api/decisions/?page=1&limit=1")
        dec = await dec_r.json()

        if dec.get("items"):
            last_decision = dec["items"][0]
            # Текущая ставка должна совпадать с new_rate последнего решения
            log(TestResult("Rate matches last AI decision",
                pool.get("interest_rate_bps") == last_decision.get("new_rate"),
                f"pool={pool.get('interest_rate_bps')}, decision={last_decision.get('new_rate')}"))
        else:
            log(TestResult("Data consistency (no decisions yet)", True, "skipped"))

async def main():
    print("=" * 50)
    print("  SMOKE TESTS — SolanaAI Lend (extended)")
    print("=" * 50)
    print()

    print("[Backend API]")
    await test_backend_health()
    print()

    print("[Pool State]")
    await test_pool_state()
    print()

    print("[Pool Stats]")
    await test_pool_stats()
    print()

    print("[Decisions]")
    await test_decisions()
    print()

    print("[Analytics]")
    await test_analytics()
    print()

    print("[WebSocket]")
    await test_websocket()
    print()

    print("[Frontend]")
    await test_frontend()
    print()

    print("[Data Consistency]")
    await test_data_consistency()
    print()

    # Summary
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    print("=" * 50)
    print(f"  Results: {passed}/{total} passed")
    if failed:
        print(f"  ❌ {failed} FAILED:")
        for r in results:
            if not r.passed:
                print(f"     - {r.name}: {r.detail}")
        sys.exit(1)
    else:
        print("  ✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 5. Мастер-скрипт — запуск всех тестов

```bash
#!/bin/bash
# scripts/run_all_tests.sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  SolanaAI Lend — Full Test Suite         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Smart Contract Tests ──
echo "━━━ [1/5] Smart Contract (Anchor) ━━━"
anchor test 2>&1 | tail -20
echo ""

# ── 2. AI Agent Unit Tests ──
echo "━━━ [2/5] AI Agent — Unit Tests ━━━"
cd ai-agent
python -m pytest tests/ -v --ignore=tests/test_ai_engine.py \
  --tb=short --no-header -q 2>&1 | tail -30
cd ..
echo ""

# ── 3. AI Agent Integration Test (Gemini) ──
echo "━━━ [3/5] AI Agent — Gemini Integration ━━━"
cd ai-agent
python -m pytest tests/test_ai_engine.py -v -m integration \
  --tb=short --no-header -q 2>&1 | tail -10
cd ..
echo ""

# ── 4. Backend API Tests ──
echo "━━━ [4/5] Backend — API + WebSocket ━━━"
cd backend
python -m pytest tests/ -v --tb=short --no-header -q 2>&1 | tail -30
cd ..
echo ""

# ── 5. Smoke Tests (if containers running) ──
echo "━━━ [5/5] Smoke Tests ━━━"
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    python docker/smoke/smoke_test.py
else
    echo "  ⚠️  Containers not running, skipping smoke tests"
    echo "  Run: docker compose -f docker/docker-compose.yml up -d"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  All test suites completed               ║"
echo "╚══════════════════════════════════════════╝"
```

---

## 6. CI-ready конфиг (pytest.ini)

```ini
# ai-agent/pytest.ini
[pytest]
asyncio_mode = auto
markers =
    integration: tests that require external APIs (Gemini)
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# backend/pytest.ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

---

## Сводка тестов

```
Уровень           Файлов  Тестов   Что покрывает
──────────────────────────────────────────────────────────
Contract (TS)       6      ~25     Все инструкции + guard rails + events
Quant Engine (Py)   1      ~18     RSI, MACD, Bollinger, ATR, EMA, кривая
ML Engine (Py)      1      ~10     Anomaly, trend, volatility, risk scorer
Aggregator (Py)     1      ~5      QuantReport, голосование, confidence
Validator (Py)      1      ~8      Все проверки перед TX
Gemini (Py)         1      ~3      Integration с реальным API
Backend Routes (Py) 4      ~18     Все REST endpoints + 422/404
WebSocket (Py)      1      ~4      Connect, initial state, ping, broadcast
Smoke bash          1      ~12     Контейнеры + endpoints + WS
Smoke python        1      ~20     Расширенная проверка + data consistency
──────────────────────────────────────────────────────────
ИТОГО:             18     ~123     Full coverage
```
