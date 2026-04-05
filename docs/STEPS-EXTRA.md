# SolanaAI Lend — Дополнительные степы (16-21)

Эти степы улучшают проект после базового MVP (степы 1-15).
Фокус: закрыть замечания ревью, усилить ML, добавить активные AI-действия.

---

## Степ 16 — Fix Critical Bugs (из ревью)
**Время:** ~2 часа
**Приоритет:** ВЫСОКИЙ — без этого жюри заметит

**Баги:**
1. `ai_engine.py` fallback confidence=0 → validator всегда отклоняет → AI крутится вхолостую если Gemini упал. **Fix:** confidence=75 в fallback
2. `lib.rs` accrue_interest использует `LendError::NothingToLiquidate` → неправильная ошибка. **Fix:** добавить `NoBorrowToAccrue`
3. Нет `emergency_unfreeze` — протокол замораживается навсегда. **Fix:** добавить инструкцию
4. `data_collector.py` pubkey как base64 вместо base58. **Fix:** `str(Pubkey.from_bytes(val))`
5. Orchestrator не закрывает aiohttp сессию при крэше. **Fix:** try/finally в `start()`

**Проверка:**
```
fallback → confidence=75 → validator пропускает → не крутится вхолостую
emergency_freeze → emergency_unfreeze → протокол работает снова
orchestrator крэш → сессии закрыты (нет "Unclosed client session" warning)
```

---

## Степ 17 — AI Active Actions (ликвидация + обновление цены + freeze)
**Время:** ~3 часа
**Приоритет:** ВЫСОКИЙ — главное замечание ревью: "AI пассивный, только крутит ручки"

Сейчас AI только меняет параметры. Добавляем 3 активных действия:

**17.1 AI-triggered Liquidation**
```
Orchestrator каждый цикл:
1. Читает все позиции с borrowed > 0
2. Для каждой: collateral_usd < borrowed * liquidation_threshold?
3. Если да → AI вызывает liquidate() on-chain
4. Лог: "AI liquidated position X, collateral $Y < threshold $Z"

Новый метод в orchestrator: check_liquidations()
Новый метод в tx_builder: send_liquidate()
```

**17.2 AI обновляет цену SOL**
```
Сейчас: set_sol_price вызывает authority вручную
Добавить: AI агент каждый цикл вызывает set_sol_price с CoinGecko данными
Контракт: добавить ai_agent в set_sol_price (has_one = ai_agent)

Это делает систему реально автономной — AI сам обновляет цену.
```

**17.3 AI Emergency Freeze**
```
Если risk_score > 90 ИЛИ anomaly_score < -0.8:
  AI вызывает emergency_freeze on-chain
  Лог: "EMERGENCY: AI froze protocol, risk=95, anomaly detected"

Контракт: добавить ai_emergency_freeze (только ai_agent может)
Отличие от authority freeze: AI freeze можно отменить через authority unfreeze.
```

**Проверка:**
```
AI цикл → обнаружена undercollateralized позиция → liquidate TX confirmed
AI цикл → CoinGecko price → set_sol_price TX confirmed → on-chain price обновлена
Имитация risk=95 → AI freeze TX → протокол заморожен → authority unfreeze → работает
```

**Для жюри:**
> "AI не просто меняет числа — он управляет протоколом: ликвидирует позиции,
> обновляет цены, и может экстренно заморозить систему при аномалиях."

---

## Степ 18 — ML Upgrade: RandomForest + Metrics + Backtest
**Время:** ~3 часа
**Приоритет:** СРЕДНИЙ — жюри спросит "где ML? где метрики?"

**18.1 Заменить LinearRegression на RandomForestClassifier**
```python
# models/trend_predictor.py
# Было: LinearRegression → predict float
# Стало: RandomForestClassifier → predict "up"/"down"/"sideways" + probability

from sklearn.ensemble import RandomForestClassifier

class TrendPredictor:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)

    def predict(self, prices, volumes, technical):
        # Features: lag returns, RSI, MACD histogram, volume ratio
        # Target: price direction in next 4 hours
        # Threshold: >+1% = up, <-1% = down, else sideways
```

**18.2 Добавить feature importance**
```python
# После fit — сохранить importances для фронтенда
importances = dict(zip(feature_names, model.feature_importances_))
# → отдавать в QuantReport → показывать на дашборде
```

**18.3 Простой backtest**
```python
# tests/test_backtest.py
# Собрать 7 дней данных с CoinGecko (168 часовых точек)
# Walk-forward: train на [0:t], predict t+1, сдвинуть окно
# Посчитать accuracy, precision, recall для "up" класса

def test_trend_backtest():
    prices = load_7d_prices()  # из fixtures
    correct = 0
    total = 0
    for t in range(48, len(prices) - 4):
        train = prices[:t]
        actual_direction = "up" if prices[t+4] > prices[t] * 1.01 else "down" if prices[t+4] < prices[t] * 0.99 else "sideways"
        predicted = predictor.predict(train, ...)
        if predicted["direction"] == actual_direction:
            correct += 1
        total += 1
    accuracy = correct / total
    assert accuracy > 0.4  # лучше случайного (33% для 3 классов)
    print(f"Trend accuracy: {accuracy:.1%} on {total} samples")
```

**18.4 Метрики в orchestrator логе**
```
[CYCLE] ML Metrics: trend_accuracy=54%, anomaly_detected=0, risk_score=12
[CYCLE] Feature importance: RSI=0.23, volume_ratio=0.19, macd_hist=0.15
```

**18.5 Model persistence (joblib)**
```python
# Сохранять модель после каждого fit
import joblib
joblib.dump(self.model, "models/trend_rf.joblib")

# Загружать при старте (если файл есть)
if Path("models/trend_rf.joblib").exists():
    self.model = joblib.load("models/trend_rf.joblib")
```

**Проверка:**
```
pytest tests/test_backtest.py → accuracy > 40%
orchestrator лог показывает метрики каждый цикл
models/trend_rf.joblib создаётся после первого цикла
```

---

## Степ 19 — Sentiment Analysis (Twitter/News)
**Время:** ~2 часа
**Приоритет:** СРЕДНИЙ — "дополнительные баллы за инновацию"

**Подход: Gemini как NLP (не нужен отдельный API)**
```
Уже есть Gemini API. Вместо отдельного NLP сервиса —
добавляем второй промпт к Gemini для sentiment analysis.

1. Собираем заголовки новостей через CoinGecko /coins/solana (news)
   или через бесплатный CryptoPanic API
2. Передаём Gemini: "Оцени sentiment этих заголовков: [list]"
3. Gemini отвечает: { "sentiment": 0.7, "summary": "Bullish due to ETF news" }
4. Sentiment добавляется в QuantReport → влияет на решение
```

```python
# agent/sentiment_engine.py
class SentimentEngine:
    async def analyze(self, headlines: list[str]) -> dict:
        prompt = f"""Rate the overall crypto market sentiment from these headlines.
        Headlines: {headlines[:10]}
        Respond JSON: {{"score": -1.0 to 1.0, "summary_en": "...", "summary_ru": "..."}}"""
        response = await self.model.generate_content_async(prompt)
        return parse_json(response.text)
```

```
QuantReport теперь включает:
  "sentiment_score": 0.7,
  "sentiment_summary_en": "Bullish: SOL ETF discussions",
  "sentiment_summary_ru": "Бычий: обсуждения SOL ETF"

Фронт показывает на дашборде: "Market Sentiment: 🟢 Bullish"
```

---

## Степ 20 — README + Demo Script + Presentation
**Время:** ~3 часа
**Приоритет:** ВЫСОКИЙ — Completeness & Documentation = 5 баллов

**README.md структура:**
```markdown
# SolanaAI Lend — AI-Powered Adaptive Lending Protocol

## Problem
DeFi lending protocols use static parameters...

## Solution
AI agent analyzes market in real-time and adapts protocol parameters.

## Architecture
[диаграмма из ARCHITECTURE.md]

## AI Pipeline
Data → Math (RSI, MACD, Bollinger) → ML (RandomForest, IsolationForest) → Gemini → Validate → On-chain TX

## Guard Rails
- Rate: 1%-20%, Collateral: 120%-200%
- Max 20% change per update, 10 min cooldown
- Emergency freeze by AI or authority

## Tech Stack
- Solana (Anchor/Rust) — smart contract
- Python (asyncio, sklearn, numpy) — AI agent
- FastAPI — backend API
- React (Vite, Tailwind) — frontend
- Gemini API — AI interpretation
- Docker Compose — deployment

## Demo
[скриншоты]
[ссылка на видео]

## Setup
git clone ... → cp .env.example .env → docker compose up

## Team
[имена]
```

**Demo Script (для записи видео):**
```
0:00 — "SolanaAI Lend — AI управляет лендинг-протоколом на Solana"
0:15 — Показать дашборд: ставка, депозиты, mood
0:30 — AI Decisions: "Вот решения AI с reasoning на русском и английском"
0:45 — Кликнуть TX → Solana Explorer → "Это on-chain, проверяемо"
1:00 — Показать guard rails: "AI не может выйти за лимиты"
1:15 — Архитектура: Data → Math → ML → Gemini → TX
1:30 — "AI обновляет цену, ликвидирует позиции, может заморозить протокол"
1:45 — Переключить RU/EN → "Двуязычный UI и AI reasoning"
2:00 — GitHub + README
```

---

## Степ 21 — Submit на Colosseum + Google Forms
**Время:** ~1 час
**Приоритет:** КРИТИЧЕСКИЙ — без сдачи работа аннулируется

**Чеклист:**
```
□ Код на GitHub (public repo)
□ README.md с описанием + скриншоты
□ Контракт задеплоен на devnet (program ID в README)
□ AI агент работает автоматически
□ Фронт доступен по IP/домену
□ Демо-видео записано (2-3 мин)
□ Сдать на Google Forms (ссылка от организаторов)
□ Сдать на Colosseum (colosseum.com) — откроется 7 апреля
□ Проверить что всё работает после push
□ Баланс AI агента > 0.1 SOL (иначе TX не пройдут на демо)
```

**Дедлайн: 7 апреля 2026, 23:59 GMT+5**

---

## Сводка дополнительных степов

```
Степ  Что                                Часы  Приоритет    Баллы
──────────────────────────────────────────────────────────────────
 16   Fix critical bugs                    2    ВЫСОКИЙ     Technical +3          ✅ DONE
 17   AI active actions (liquidate+price)  3    ВЫСОКИЙ     Innovation +5         ✅ DONE
 18   ML upgrade (RF + metrics + backtest) 3    СРЕДНИЙ     Innovation +3         ✅ DONE
 19   Sentiment analysis                   2    СРЕДНИЙ     Innovation +2         ✅ DONE
 20   README + Demo + Presentation         3    ВЫСОКИЙ     Documentation +5      ✅ DONE
 21   Submit                               1    КРИТИЧЕСКИЙ  Без этого = 0        ⬜ TODO
 22   Keeper rewards + partial liquidation 2    ВЫСОКИЙ     Innovation +5         ⬜ TODO
 23   Danger counter (auto rate increase)  1    ВЫСОКИЙ     Innovation +3         ⬜ TODO
 24   Jito MEV protection                  1    СРЕДНИЙ     Technical +2          ⬜ TODO
──────────────────────────────────────────────────────────────────
                                     ИТОГО: 18 часов
```

---

## Степ 22 — Health Factor + Partial Liquidation + Keeper Rewards
**Время:** ~2.5 часа
**Приоритет:** ВЫСОКИЙ — отличает production от учебного проекта
**Источник:** [Ripe Protocol](https://github.com/Ripe-Foundation/ripe-protocol), Aave v3

### Почему это важно

GPT/Claude могут сгенерить простой lending. Но partial liquidation + keeper rewards
делают только те кто понимает DeFi глубоко. Жюри это увидит.

### 22.1 Health Factor на фронте и бэке

Health Factor = показатель здоровья позиции. Одно число вместо кучи метрик.

```
health = (collateral_usd × 10000) / (borrowed × liquidation_threshold)

health > 1.5 → Здоров (зелёный)
health 1.0-1.5 → Под наблюдением (жёлтый)
health < 1.0 → ЛИКВИДАЦИЯ (красный)
```

**Контракт (lib.rs):**
```rust
// Добавить view-функцию (не меняет state):
pub fn get_health_factor(collateral_sol: u64, sol_price: u64, borrowed: u64, threshold: u16) -> u64 {
    let collateral_usd = (collateral_sol as u128 * sol_price as u128) / 1_000_000_000;
    if borrowed == 0 { return u64::MAX; }
    (collateral_usd * 10000 / (borrowed as u128 * threshold as u128 / 10000)) as u64
}
```

**Backend (pool router):** добавить health_factor в `/api/pool/stats`

**Frontend:** показать Health Factor как прогресс-бар на дашборде
```
┌─ Health Factor ──────────────────────────────────┐
│ ████████████████████░░░░  1.35 (Под наблюдением) │
│ [зелёный|жёлтый|красный] полоса                  │
└──────────────────────────────────────────────────┘
```

### 22.2 Partial Liquidation в контракте

Обычный протокол: ликвидация забирает ВСЁ → заёмщик теряет весь залог.
Production протокол (Aave v3): ликвидируют МИНИМУМ чтобы вернуть health > 1.1.

```
Пример:
  Залог: $100 SOL, Долг: $80, Health: 0.95 (ниже 1.0 → ликвидация)
  
  Простой протокол: забрать $100, заёмщик получает $0
  Наш протокол: забрать $22 залога, погасить $20 долга
    → Залог $78, Долг $60, Health: 1.30 → позиция спасена
    → Заёмщик сохранил $78 вместо $0
```

**Контракт:** изменить `liquidate()` — параметр `max_repay_amount` (сколько долга погасить)

**Frontend:** в Activity показывать "Частичная ликвидация: $20 из $80 долга погашено"

### 22.3 Keeper Rewards

Мотивация для ликвидаторов: кто вызвал `liquidate` — получает 1% от погашенного долга.

**Контракт:** добавить `keeper_reward_bps` в LendingPool (100 = 1%)

**Frontend:** показать в Activity: "Ликвидация: погашено $20, reward $0.20 → keeper 7h3i..."

### Что видно на фронте после степа 22:

```
Дашборд:
  ┌── Health Factor ─────────────────┐
  │ ████████████████░░░░  1.35       │
  │ Под наблюдением                   │
  └──────────────────────────────────┘

Операции:
  ⚠ Частичная ликвидация  $20 aiUSDC   4/7 12:30
    Погашено $20 из $80 долга
    Keeper reward: $0.20
    Health: 0.95 → 1.30
    TX: 5xK9f...
```

---

## Степ 23 — On-chain Safety Net (контракт работает без AI)
**Время:** ~1.5 часа
**Приоритет:** ВЫСОКИЙ — главный аргумент для жюри "это не зависит от AI"

### Проблема

Вопрос жюри: "А что если ваш AI упадёт? Gemini не отвечает? Сервер сдох?"
Ответ: "Контракт САМИ поднимет ставку. AI не нужен для безопасности."

### Решение: Danger Counter + Auto Rate

Когда утилизация > 85% — контракт начинает счётчик. Каждые 100 слотов (~40 сек)
ставка растёт на 0.5%. Когда утилизация падает — счётчик сбрасывается.

**Контракт (lib.rs):**
```rust
// Добавить в LendingPool:
pub danger_slots: u64,
pub auto_rate_active: bool,
pub last_danger_check: i64,

// В borrow() и repay() — вызывать check_danger()
fn check_and_update_danger(pool: &mut LendingPool) -> Result<()> {
    if pool.total_deposits == 0 { return Ok(()); }
    let util = pool.total_borrows * 10000 / pool.total_deposits;
    
    if util > 8500 { // > 85%
        pool.danger_slots = pool.danger_slots.saturating_add(1);
        
        if pool.danger_slots > 100 { // ~40 сек
            let increase = 50u16; // +0.5% за порог
            let new_rate = pool.interest_rate_bps.saturating_add(increase);
            if new_rate <= pool.max_interest_rate_bps {
                pool.interest_rate_bps = new_rate;
                pool.auto_rate_active = true;
                emit!(AutoRateEvent {
                    pool: pool.key(),
                    new_rate,
                    danger_slots: pool.danger_slots,
                    timestamp: Clock::get()?.unix_timestamp,
                });
            }
            pool.danger_slots = 0; // reset после повышения
        }
    } else {
        if pool.danger_slots > 0 {
            pool.danger_slots = 0;
            pool.auto_rate_active = false;
        }
    }
    Ok(())
}
```

**Backend:** добавить `auto_rate_active` и `danger_slots` в `/api/pool/state`

**Frontend:** показать badge на дашборде
```
Нормально:           Опасно:
[AI Active 🟢]       [AUTO-RATE ⚠️ +0.5%]
                     "Контракт повысил ставку автоматически"
```

### Что видно на фронте после степа 23:

```
Дашборд:
  ┌── Protocol Status ──────────────┐
  │ AI Agent: 🟢 Active (11 мин)   │
  │ Auto-rate: ⚪ Inactive          │
  │ Danger: 0 slots                 │
  └─────────────────────────────────┘

  При высокой утилизации:
  ┌── Protocol Status ──────────────┐
  │ AI Agent: 🔴 Offline (2ч)      │
  │ Auto-rate: 🟡 ACTIVE (+0.5%)   │
  │ Danger: 247 slots              │
  │ "Контракт сам повысил ставку"  │
  └─────────────────────────────────┘
```

### Для жюри:
> "5 уровней защиты: Промпт → Validator → Контракт → Emergency Freeze → Auto-rate.
> Даже если AI, бэкенд и сервер полностью мертвы — контракт сам защитит ликвидность."

---

## Степ 24 — MEV Protection + Production Readiness
**Время:** ~1.5 часа
**Приоритет:** СРЕДНИЙ — показывает что думаем о mainnet
**Источник:** [solana-mev-literature](https://github.com/urani-trade/solana-mev-literature)

### 24.1 Jito Bundle для ликвидаций (код, не демо)

На devnet Jito не работает. Но код показывает production-мышление.

**AI Agent (tx_builder.py):** добавить `send_via_jito()` с fallback на обычный RPC

```python
async def send_liquidate(self, ...):
    """Try Jito first (MEV protection), fallback to regular RPC."""
    if self.settings.use_jito:
        result = await self._send_jito_bundle(tx)
        if result:
            return result
    # Fallback
    return await self._send_regular(tx)
```

### 24.2 Transaction Priority Fees

На mainnet нужны priority fees для быстрого подтверждения.

```python
# Добавить compute budget instruction:
from solders.compute_budget import set_compute_unit_price
ix_priority = set_compute_unit_price(50_000)  # 50k microlamports
# Добавить как первую инструкцию в TX
```

### 24.3 Production Checklist на фронте

Страница "System Status" показывающая production readiness:

```
┌── Production Readiness ───────────────────────────┐
│ ✅ Контракт задеплоен (devnet)                     │
│ ✅ Guard rails: 5 уровней защиты                   │
│ ✅ AI Agent: работает автономно                     │
│ ✅ Partial liquidation                              │
│ ✅ Keeper rewards                                   │
│ ✅ Auto-rate fallback                               │
│ ⬜ Jito MEV protection (mainnet only)              │
│ ⬜ Priority fees (mainnet only)                     │
│ ⬜ Multi-oracle (Pyth + Switchboard)               │
│ ⬜ Audit                                            │
│                                                     │
│ Devnet: ready ✅   Mainnet: 4 items remaining      │
└───────────────────────────────────────────────────┘
```

### Для жюри:
> "Мы не просто сделали MVP — мы продумали путь к mainnet.
> Jito MEV protection, priority fees, multi-oracle — всё готово в коде,
> ждёт аудита и mainnet deploy."

---

## Порядок приоритетов

```
СДЕЛАНО:
  ✅ 16: Fix bugs
  ✅ 17: AI active actions (price, liquidate, freeze)
  ✅ 18: ML upgrade (RandomForest + metrics + backtest)
  ✅ 19: Sentiment (CryptoPanic + Gemini NLP + noise filter)
  ✅ 20: README + Demo + Presentation

ОСТАЛОСЬ:
  1. Степ 22: Health Factor + Partial Liquidation + Keeper (2.5ч) — ВЫСОКИЙ
     → Видно на фронте: Health bar + Activity с partial liquidation
     
  2. Степ 23: Danger Counter + Auto-rate (1.5ч) — ВЫСОКИЙ
     → Видно на фронте: Protocol Status badge
     → Аргумент для жюри: "работает без AI"
     
  3. Степ 21: Submit Colosseum + Google Forms (1ч) — КРИТИЧЕСКИЙ
  
  4. Степ 24: MEV + Production Checklist (1.5ч) — СРЕДНИЙ
     → Видно на фронте: Production Readiness page
     → Показывает mainnet-мышление

  5. Степ 25: Pyth Oracle on-chain (1.5ч) — ВЫСОКИЙ
     → Реальные цены вместо ручных, staleness protection
     
  6. Степ 26: Viewing Keys + Role Separation (2ч) — СРЕДНИЙ
     → AI видит но не трогает, keeper видит но не крадёт
     
  7. Степ 27: Token-2022 + Future Roadmap (1ч) — НИЗКИЙ
     → Confidential transfers, stealth addresses в презе

  Итого: ~12 часов. Дедлайн: 7 апреля 23:59 GMT+5
```

---

## Степ 25 — Pyth Oracle On-chain (реальные цены)
**Время:** ~1.5 часа
**Приоритет:** ВЫСОКИЙ — без оракула lending протокол не считается production
**Источник:** [thezapcoin](https://github.com/justin212407/thezapcoin), Aave, Compound

### Проблема

Сейчас `set_sol_price` — ручная установка цены AI-агентом или authority.
Жюри спросит: "А если AI подставит неправильную цену?"
Ответ: "Мы берём цену из Pyth oracle — децентрализованного источника."

### Решение

Pyth Network на Solana devnet даёт реальные цены SOL/USD.

**Контракт (lib.rs):**
```rust
// Добавить в borrow() и liquidate():
// Вместо: pool.sol_price_usd (установлено вручную)
// Читаем: Pyth price feed account напрямую

use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    // Прочитать цену из Pyth
    let price_feed = &ctx.accounts.pyth_price_feed;
    let price_data = price_feed.get_price_no_older_than(
        &Clock::get()?,
        300, // max 5 мин staleness
    ).ok_or(LendError::InvalidPrice)?;
    
    let sol_price_usd = price_data.price as u64; // нормализовать
    
    // Использовать sol_price_usd для расчёта залога
    ...
}
```

**AI Agent:** продолжает обновлять `set_sol_price` как fallback, но контракт
предпочитает Pyth если доступен.

**Frontend:** показать источник цены
```
SOL Price: $80.21
  Source: 🟢 Pyth Oracle (live)     ← реальные данные
  Fallback: AI Agent (CoinGecko)    ← если Pyth недоступен
  Last update: 2 sec ago
```

### Multi-oracle fallback (3 уровня):
```
Уровень 1: Pyth Oracle (on-chain, децентрализованный)
Уровень 2: AI Agent → CoinGecko → set_sol_price (off-chain)
Уровень 3: Последняя известная цена + staleness warning

Если Pyth stale > 5 мин → используем AI цену
Если AI тоже stale > 1 час → freeze pool (emergency)
```

### Для жюри:
> "Мы не доверяем одному источнику цены. 3-уровневый oracle fallback:
> Pyth → AI/CoinGecko → Emergency freeze. Как в production Aave."

---

## Степ 26 — Role-Based Access + Viewing Keys
**Время:** ~2 часа
**Приоритет:** СРЕДНИЙ — уникальная фича, никто на хакатоне не сделает
**Источник:** [zeraprivacy/GhostSol](https://github.com/jskoiz/zeraprivacy), [zenlok](https://github.com/zenlok/contract)

### Проблема

Сейчас:
- AI агент имеет keypair который может вызвать `update_parameters` + `set_sol_price` + `liquidate`
- Если ключ AI утёк → злоумышленник может менять ставки

### Решение: Role Separation (разделение ролей)

3 роли с разными правами:

```
ROLE             МОЖЕТ                           НЕ МОЖЕТ
─────────────────────────────────────────────────────────
Authority        freeze/unfreeze, менять AI       двигать деньги юзеров
AI Agent         update_parameters, set_price     withdraw, transfer
Keeper           liquidate (получает reward)       менять параметры
Viewer (new)     читать все позиции               подписывать TX
```

**Контракт (lib.rs):**
```rust
// Добавить в LendingPool:
pub keeper_authority: Pubkey,    // отдельный ключ для keeper-ов
pub viewer_authority: Pubkey,    // read-only доступ для аналитики

// Новая инструкция:
pub fn set_roles(
    ctx: Context<SetRoles>,
    new_ai_agent: Option<Pubkey>,
    new_keeper: Option<Pubkey>,
    new_viewer: Option<Pubkey>,
) -> Result<()> {
    // Только authority может менять роли
    ...
}
```

**Viewing Key паттерн:**
```
AI Agent:
  ├── Видит: все позиции, балансы, утилизацию
  ├── Может: update_parameters, set_sol_price
  └── НЕ может: withdraw, transfer, close accounts

Keeper:
  ├── Видит: позиции с health < 1.0
  ├── Может: liquidate (получает reward)
  └── НЕ может: update_parameters, freeze

Viewer (для аудита/compliance):
  ├── Видит: ВСЁ (позиции, параметры, логи)
  └── НЕ может: НИЧЕГО (read-only)
```

**Frontend:** показать роли на дашборде
```
┌── Protocol Roles ─────────────────────────┐
│ Authority: 7h3i4A... (owner)              │
│ AI Agent:  J2j7JL... (rate management)    │
│ Keeper:    open (anyone can liquidate)     │
│ Viewer:    public (on-chain data)          │
└───────────────────────────────────────────┘
```

### Для жюри:
> "Principle of Least Privilege — каждая роль имеет минимально
> необходимые права. AI не может украсть деньги, keeper не может
> менять ставки. Это enterprise-grade security."

---

## Степ 27 — Token-2022 + Confidential Transfers + Future Roadmap
**Время:** ~1 час (презентация + код-заготовка)
**Приоритет:** НИЗКИЙ — "future work" в презе, но код показать можно
**Источник:** [zeraprivacy](https://github.com/jskoiz/zeraprivacy), [zenlok](https://github.com/zenlok/contract)

### Что это

SPL Token-2022 = новый стандарт токенов Solana с расширениями:
- **Confidential Transfers** — суммы переводов зашифрованы
- **Transfer Hooks** — кастомная логика при каждом переводе
- **Interest Bearing** — токен сам начисляет проценты

### Как это улучшает наш протокол

```
СЕЙЧАС (SPL Token):
  Все видят: "Вася положил $10,000 в пул"
  MEV-боты видят: "Вася имеет позицию $10K, залог $8K — можно ликвидировать"

С TOKEN-2022 (будущее):
  Все видят: "Кто-то сделал операцию" (сумма зашифрована)
  MEV-боты: не знают размер позиции → не могут целенаправленно ликвидировать
```

### Stealth Addresses для позиций

```
СЕЙЧАС:
  Позиция Васи: PDA seeds = ["position", pool, vasia_pubkey]
  Любой может найти все позиции Васи

СО STEALTH ADDRESSES:
  Каждая позиция на уникальном одноразовом адресе
  Невозможно связать позиции одного юзера
```

### Что делаем для хакатона

Не реализуем полностью — слишком сложно. Но:

1. **Код-заготовка** `token2022_upgrade.rs` — scaffold для миграции
2. **Слайд в презентации** — "Future: Confidential Lending"
3. **README секция** — "Roadmap to Mainnet"

**Frontend:** добавить в Production Readiness checklist:
```
┌── Roadmap to Mainnet ─────────────────────────┐
│ ✅ Phase 1: MVP on Devnet (DONE)               │
│ ✅ Phase 2: AI + ML + Sentiment (DONE)          │
│ ⬜ Phase 3: Token-2022 Confidential Transfers   │
│ ⬜ Phase 4: Stealth Addresses for Positions     │
│ ⬜ Phase 5: Arcium Confidential Computing       │
│ ⬜ Phase 6: Mainnet Audit + Deploy              │
└───────────────────────────────────────────────┘
```

### Для жюри:
> "Мы знаем куда идёт Solana — Token-2022, confidential transfers,
> stealth addresses. Наш протокол готов к этой эволюции.
> Privacy + AI = будущее DeFi."

---

## Степ 28 — Stealth Deposits (ECDH Privacy Layer)
**Время:** ~2.5 часа
**Приоритет:** ВЫСОКИЙ — ни один другой проект на хакатоне этого не сделает
**Источник:** [zeraprivacy/GhostSol](https://github.com/jskoiz/zeraprivacy) — рабочая крипта на `@noble/curves`

### Проблема

Все видят on-chain: "Вася положил $10K в пул". MEV-боты и конкуренты знают
размеры позиций, могут таргетить ликвидации. Ни один Solana lending протокол
не решает эту проблему.

### Решение: Stealth Addresses для депозитов

ECDH-протокол на Ed25519. Каждый депозит идёт на уникальный одноразовый адрес.
Невозможно связать два депозита одного юзера.

**Как работает:**
```
1. Юзер генерирует stealth meta-address (viewKey + spendKey)
2. При депозите протокол вычисляет:
   sharedSecret = SHA256(ephemeralPrivate * viewPublicKey)
   stealthPubKey = spendPublicKey + H(sharedSecret) * G
3. Депозит уходит на stealthPubKey — уникальный, одноразовый
4. Ephemeral key сохраняется в memo транзакции: "STEALTH:<base58_key>"
5. Юзер сканирует мемо → находит свои депозиты
```

**Frontend (src/components/deposit/):**

Добавить переключатель "Private Deposit" на странице Deposit:
```
┌── Deposit ──────────────────────────────────────┐
│                                                  │
│  Amount: [____1000____] aiUSDC                   │
│  [25%] [50%] [75%] [MAX]                         │
│                                                  │
│  ┌─ Privacy Mode ────────────────────────────┐  │
│  │  ○ Standard — видно всем on-chain         │  │
│  │  ● Private  — stealth address (ECDH)      │  │
│  │                                            │  │
│  │  Your stealth meta-address:               │  │
│  │  [5Kd9...7hF2] [Copy]                     │  │
│  │                                            │  │
│  │  ℹ Each deposit goes to a unique          │  │
│  │    one-time address. Unlinkable.          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [Deposit Privately]                             │
└──────────────────────────────────────────────────┘
```

**Реализация:**

```
frontend/src/lib/stealth.ts:
  - generateStealthMetaAddress() → { viewKey, spendKey, metaAddress }
  - deriveStealthAddress(metaAddress, ephemeral) → one-time pubkey
  - scanForPayments(viewKey, txMemos[]) → found deposits
  
  Зависимости: @noble/curves (Ed25519), @noble/hashes (SHA256)
  Всё работает в браузере, нет бэкенда для крипты.

frontend/src/hooks/useStealthDeposit.ts:
  - Генерация ephemeral key
  - Вычисление stealth address
  - Отправка TX с memo "STEALTH:<ephemeralPubKey>"
  - Сохранение viewKey в localStorage

frontend/src/hooks/useStealthScanner.ts:
  - Сканирование мемо транзакций пула
  - Обнаружение своих депозитов через viewKey
  - Показ в UI: "Found 3 private deposits, total: 5000 aiUSDC"
```

**Backend:** добавить endpoint `GET /api/pool/stealth-stats`
```json
{
  "total_stealth_deposits": 12,
  "stealth_volume_percent": 23.5,
  "last_stealth_deposit": "2026-04-05T12:30:00Z"
}
```

**Dashboard виджет:**
```
┌── Privacy Stats ─────────────────┐
│ Stealth Deposits: 12 (23%)      │
│ Standard Deposits: 40 (77%)     │
│ Protocol: ECDH + Ed25519        │
└──────────────────────────────────┘
```

### Проверка
```
1. Включить "Private" toggle → генерируется meta-address
2. Deposit 100 aiUSDC → TX с memo STEALTH:...
3. Другой юзер не может связать два депозита
4. Scanner находит свои депозиты через viewKey
5. Withdraw из stealth позиции → OK
```

### Для жюри:
> "Мы единственные кто реализовал stealth addresses в lending протоколе.
> Реальная криптография (ECDH, Ed25519), не симуляция.
> Privacy + AI Lending = то, что DeFi нужно."

---

## Степ 29 — Viewing Keys + Compliance Dashboard
**Время:** ~2 часа
**Приоритет:** ВЫСОКИЙ — enterprise-grade фича, жюри оценит зрелость
**Источник:** [zeraprivacy](https://github.com/jskoiz/zeraprivacy), [zenlok](https://github.com/zenlok/contract)

### Проблема

Stealth deposits скрывают позиции. Но регуляторы и аудиторы должны иметь
возможность проверить. Как дать доступ без раскрытия приватных ключей?

### Решение: Time-Limited Viewing Keys

Юзер генерирует viewing key с ограниченными правами и сроком действия.
Аудитор может ВИДЕТЬ позиции, но НЕ может подписывать транзакции.

**Контракт (lib.rs):**
```rust
// Добавить в UserPosition:
pub viewing_key_hash: Option<[u8; 32]>,  // SHA256 от viewing key
pub viewing_key_expires: Option<i64>,     // unix timestamp

// Новая инструкция:
pub fn set_viewing_key(
    ctx: Context<SetViewingKey>,
    key_hash: [u8; 32],
    expires_at: i64,
) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    position.viewing_key_hash = Some(key_hash);
    position.viewing_key_expires = Some(expires_at);
    emit!(ViewingKeySetEvent { ... });
    Ok(())
}
```

**Frontend — новая вкладка "Access" в профиле:**
```
┌── Viewing Keys ──────────────────────────────────┐
│                                                   │
│  Generate a viewing key for auditors/regulators.  │
│  They can see your positions but cannot transact. │
│                                                   │
│  Permissions:                                     │
│  [x] View balance       [x] View collateral       │
│  [x] View health factor [ ] View transaction history│
│                                                   │
│  Expires: [24 hours ▾]                            │
│                                                   │
│  [Generate Viewing Key]                           │
│                                                   │
│  ┌─ Active Keys ─────────────────────────────┐   │
│  │ Key #1: 7Kd9...2hF  expires in 18h  [Revoke]│  │
│  │ Key #2: 3Ab1...9cE  expires in 6h   [Revoke]│  │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Frontend — Audit View (отдельная страница /audit?key=...):**
```
┌── Audit View (Read-Only) ────────────────────────┐
│ Viewing key: 7Kd9...2hF                          │
│ Expires: 18h remaining                            │
│ Permissions: balance, collateral, health          │
│                                                   │
│ ┌── Position ────────────────────────────────┐   │
│ │ Deposited: 5,000 aiUSDC                    │   │
│ │ Borrowed: 2,000 aiUSDC                     │   │
│ │ Collateral: 15 SOL ($1,200)                │   │
│ │ Health Factor: 1.45 (Safe)                 │   │
│ │ Loyalty: Gold                              │   │
│ └────────────────────────────────────────────┘   │
│                                                   │
│ ⚠ Read-only access. No transactions possible.    │
└──────────────────────────────────────────────────┘
```

**Реализация:**
```
frontend/src/lib/viewing-keys.ts:
  - generateViewingKey(permissions, ttl) → { key, hash }
  - Шифрование: AES-GCM, ключ = HKDF(viewKey + spendKey)
  - Хранение: key_hash on-chain, полный key у юзера

frontend/src/pages/AuditView.tsx:
  - URL: /audit?key=<base58_viewing_key>
  - Верификация: SHA256(key) == position.viewing_key_hash
  - Проверка expires > now
  - Read-only рендер позиции

backend/app/routers/audit.py:
  - GET /api/audit/verify?key=... → position data (если ключ валиден)
```

### Для жюри:
> "Privacy без accountability = анархия. Наш протокол даёт privacy через
> stealth addresses И compliance через viewing keys. Регулятор видит, но
> не трогает. Это enterprise-grade решение."

---

## Степ 30 — Leaderboard + Keeper Rankings
**Время:** ~1.5 часа
**Приоритет:** СРЕДНИЙ — engagement, видно на фронте, используем уже имеющиеся on-chain данные
**Источник:** [thezapcoin](https://github.com/justin212407/thezapcoin)

### Что делаем

Контракт уже хранит: `total_operations`, `first_deposit_at`, `loyalty_tier`,
`total_deposits_count`, `total_borrows_count`. Показываем это как лидерборд.

**Frontend — новая страница /leaderboard:**
```
┌── Leaderboard ───────────────────────────────────────────┐
│                                                           │
│  [Top Depositors] [Top Keepers] [Loyalty Tiers]          │
│                                                           │
│  ── Top Depositors ──────────────────────────────────    │
│  #  Address        Deposited    Operations  Tier         │
│  1  7h3i...4A     $50,000      127         Platinum     │
│  2  J2j7...JL     $32,000       89         Gold         │
│  3  9Kf2...xB     $28,500       76         Gold         │
│  4  3Ab1...cE     $15,000       45         Silver       │
│  5  You → 5Kd...F  $5,000       12         Bronze      │
│                                                           │
│  ── Top Keepers (Liquidators) ───────────────────────    │
│  #  Address        Liquidations  Rewards Earned          │
│  1  Mf4k...2Q     23            $115.00                  │
│  2  8Rj1...vN     17            $82.50                   │
│  3  AI Agent       12            $55.00                   │
│                                                           │
│  ── Loyalty Distribution ────────────────────────────    │
│  Platinum ██░░░░░░░░  3 users (5%)                       │
│  Gold     ████░░░░░░  8 users (13%)                      │
│  Silver   ████████░░  22 users (37%)                     │
│  Bronze   ██████████  27 users (45%)                     │
└──────────────────────────────────────────────────────────┘
```

**Backend:**
```
GET /api/leaderboard/depositors?limit=10 → top depositors by total_deposits
GET /api/leaderboard/keepers?limit=10 → top keepers by liquidation count + rewards
GET /api/leaderboard/tiers → distribution by loyalty tier
```

**Реализация:**
```
backend/app/routers/leaderboard.py:
  - Читаем все UserPosition аккаунты через getProgramAccounts (RPC)
  - Сортируем по total_deposits / operations / tier
  - Кэш 60 сек (тяжёлый RPC запрос)

frontend/src/pages/Leaderboard.tsx:
  - 3 таба: Depositors / Keepers / Tiers
  - Хайлайт текущего юзера в таблице
  - Mobile: карточки вместо таблицы

frontend/src/components/layout/BottomNav.tsx:
  - Добавить иконку трофея → /leaderboard
```

**Dashboard виджет (компактный):**
```
┌── Your Rank ──────────┐
│ #12 of 60 depositors  │
│ Tier: Silver → Gold   │
│ Progress: ████░ 72%   │
└───────────────────────┘
```

### Для жюри:
> "Gamification увеличивает retention. Keeper leaderboard мотивирует
> ликвидаторов. Всё построено на реальных on-chain данных."

---

## Степ 31 — Position Transfer (Secondary Market)
**Время:** ~2 часа
**Приоритет:** СРЕДНИЙ — уникальная DeFi механика, ни один хакатон-проект не делает
**Источник:** [zenlok](https://github.com/zenlok/contract) — two-step ownership transfer pattern

### Проблема

Юзер положил $10K на 6 месяцев, накопил Gold loyalty tier. Ему срочно нужны
деньги, но withdraw = потеря позиции и tier. Решение: продать позицию другому.

### Решение: Two-Step Position Transfer

```
Шаг 1: Seller вызывает transfer_position(buyer_pubkey)
        → position.pending_transfer = Some(buyer_pubkey)
        → position.status = PendingTransfer

Шаг 2: Buyer вызывает accept_position()
        → ownership меняется
        → loyalty tier и history сохраняются
        → seller может cancel до accept
```

**Контракт (lib.rs):**
```rust
// Добавить в UserPosition:
pub pending_transfer: Option<Pubkey>,

// Две новые инструкции:
pub fn transfer_position(ctx: Context<TransferPosition>, new_owner: Pubkey) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    require!(position.borrowed == 0, LendError::HasActiveBorrow);
    position.pending_transfer = Some(new_owner);
    emit!(PositionTransferInitiated { from: ..., to: new_owner });
    Ok(())
}

pub fn accept_position(ctx: Context<AcceptPosition>) -> Result<()> {
    // Верифицировать что signer == pending_transfer
    // Создать новую позицию для buyer с данными seller
    // Закрыть старую позицию seller
    emit!(PositionTransferCompleted { ... });
    Ok(())
}
```

**Frontend — кнопка на странице позиции:**
```
┌── Your Position ─────────────────────────────────┐
│ Deposited: 5,000 aiUSDC                          │
│ Loyalty: Gold (127 operations)                   │
│ Health: 1.45                                      │
│                                                   │
│ [Withdraw]  [Transfer Position]                   │
└──────────────────────────────────────────────────┘

При клике Transfer:
┌── Transfer Position ─────────────────────────────┐
│ Transfer your deposit position to another wallet. │
│ Loyalty tier and history will be preserved.       │
│                                                   │
│ Recipient: [_____wallet address_____]             │
│                                                   │
│ ⚠ You must have no active borrows.               │
│ ⚠ Recipient must accept the transfer.            │
│                                                   │
│ [Initiate Transfer]  [Cancel]                     │
└──────────────────────────────────────────────────┘

Pending state:
┌── Transfer Pending ──────────────────────────────┐
│ Waiting for 3Ab1...cE to accept.                 │
│ [Cancel Transfer]                                 │
└──────────────────────────────────────────────────┘
```

**Activity feed:** показывает трансферы как отдельный тип
```
↔ Position Transfer  5,000 aiUSDC  Gold tier   4/7 14:20
  From: 5Kd9...7hF → To: 3Ab1...cE
  TX: 8xK2f...
```

### Для жюри:
> "Secondary market для lending позиций. Юзер может продать позицию
> с сохранением loyalty tier. Two-step transfer = безопасность.
> Это паттерн из production DeFi (Aave v3 credit delegation)."

---

## Степ 32 — Model Reputation Tracking (Self-Improving AI)
**Время:** ~1.5 часа
**Приоритет:** ВЫСОКИЙ — превращает AI из "чёрного ящика" в прозрачную систему с метриками
**Источник:** [YieldSage](https://github.com/youngjun-k/yieldsage) — reputation-weighted collaborative decisions

### Проблема

Сейчас 5 ML моделей имеют статические веса в решении. Если TrendPredictor
ошибается 10 раз подряд — он всё ещё влияет одинаково. Жюри спросит:
"Как AI учится на ошибках?"

### Решение: Rolling Accuracy + Dynamic Weighting

Каждая модель получает accuracy score на основе последних N предсказаний.
Вес модели в финальном решении = f(accuracy). Плохая модель автоматически
теряет влияние, хорошая — усиливается.

**AI Agent (ai-agent/agent/model_reputation.py):**
```python
class ModelReputation:
    """Track per-model accuracy with rolling window."""
    
    def __init__(self, window=50):
        self.history = {
            "trend_predictor": deque(maxlen=window),
            "anomaly_detector": deque(maxlen=window),
            "volatility_model": deque(maxlen=window),
            "risk_scorer": deque(maxlen=window),
            "utilization_predictor": deque(maxlen=window),
        }
    
    def record(self, model: str, predicted, actual):
        """After each cycle, compare prediction vs reality."""
        error = abs(predicted - actual) / max(actual, 1)
        accuracy = max(0, 1.0 - error)
        self.history[model].append(accuracy)
    
    def get_weights(self) -> dict:
        """Dynamic weights based on recent accuracy."""
        weights = {}
        for model, hist in self.history.items():
            if len(hist) < 5:
                weights[model] = 1.0  # default until enough data
            else:
                avg_accuracy = sum(hist) / len(hist)
                weights[model] = max(0.1, avg_accuracy)  # floor at 0.1
        
        # Normalize to sum=1
        total = sum(weights.values())
        return {k: v/total for k, v in weights.items()}
```

**Orchestrator integration:**
```python
# В каждом цикле:
# 1. Проверить предыдущее предсказание vs реальность
reputation.record("trend_predictor", 
    predicted=last_trend_direction, 
    actual=actual_price_direction)

# 2. Получить динамические веса
weights = reputation.get_weights()

# 3. Передать в QuantReport → Gemini видит веса
quant_report["model_weights"] = weights
quant_report["model_accuracies"] = reputation.get_accuracies()
```

**Backend — новый endpoint:**
```
GET /api/ai/model-stats → {
  "trend_predictor":       { "accuracy": 0.62, "weight": 0.24, "last_50": [...] },
  "anomaly_detector":      { "accuracy": 0.78, "weight": 0.31, "last_50": [...] },
  "volatility_model":      { "accuracy": 0.55, "weight": 0.18, "last_50": [...] },
  "risk_scorer":           { "accuracy": 0.71, "weight": 0.27, "last_50": [...] },
  "utilization_predictor": { "accuracy": 0.48, "weight": 0.15, "last_50": [...] }
}
```

**Frontend — виджет на AI Decisions странице:**
```
┌── AI Model Performance ──────────────────────────────────┐
│                                                           │
│  Model               Accuracy   Weight   Trend           │
│  Anomaly Detector    78%        0.31     ████████ ↑      │
│  Risk Scorer         71%        0.27     ███████  →      │
│  Trend Predictor     62%        0.24     ██████   ↓      │
│  Volatility Model    55%        0.18     █████    →      │
│  Util Predictor      48%        0.15     ████     ↓      │
│                                                           │
│  ℹ Weights auto-adjust every cycle based on accuracy.    │
│    Better models get more influence on rate decisions.    │
└──────────────────────────────────────────────────────────┘
```

### Проверка
```
1. Запустить 10 циклов AI → модели накапливают accuracy
2. Модель с низкой accuracy → вес падает автоматически
3. /api/ai/model-stats → показывает реальные метрики
4. Frontend → виджет обновляется каждый цикл
```

### Для жюри:
> "Наш AI не статический — он УЧИТСЯ. 5 моделей конкурируют,
> плохие теряют вес автоматически. Self-improving AI lending.
> У конкурентов? YieldSage врёт про GARCH, SolSkill — if/else.
> У нас — реальные метрики на каждую модель."

---

## Степ 33 — Dual-Layer Guardrails (On-chain PDA + Python)
**Время:** ~1.5 часа
**Приоритет:** ВЫСОКИЙ — единственный проект с двойной защитой
**Источник:** [AgentVault](https://github.com/cloudweaver/agentvault) — dual-layer policy enforcement

### Проблема

Сейчас guard rails проверяются:
- В Python (validator.py) — ДО транзакции
- В контракте (lib.rs) — ВО ВРЕМЯ транзакции

Но параметры guard rails (min/max rate, cooldown) зашиты в коде контракта.
Если нужно изменить — redeploy. А если Python validator скомпрометирован,
он может послать невалидные данные (хотя контракт отклонит — нет прозрачности).

### Решение: GuardrailConfig PDA + Policy Hash Sync

Хранить параметры guard rails в отдельном on-chain PDA. Python agent
сверяет свой конфиг с on-chain hash перед каждым циклом. Рассинхрон = стоп.

**Контракт (lib.rs):**
```rust
#[account]
pub struct GuardrailConfig {
    pub authority: Pubkey,
    pub min_rate_bps: u16,           // default 100 (1%)
    pub max_rate_bps: u16,           // default 2000 (20%)
    pub min_collateral_bps: u16,     // default 12000 (120%)
    pub max_collateral_bps: u16,     // default 20000 (200%)
    pub max_change_bps: u16,         // default 2000 (20%)
    pub cooldown_seconds: i64,       // default 600 (10 min)
    pub config_hash: [u8; 32],       // SHA256 всех параметров
    pub last_updated: i64,
    pub bump: u8,
}

// Новая инструкция: обновить guardrails (только authority)
pub fn update_guardrails(ctx: Context<UpdateGuardrails>, params: GuardrailParams) -> Result<()> {
    let config = &mut ctx.accounts.guardrail_config;
    config.min_rate_bps = params.min_rate_bps;
    config.max_rate_bps = params.max_rate_bps;
    // ...
    config.config_hash = sha256(params.to_bytes());
    emit!(GuardrailsUpdatedEvent { ... });
    Ok(())
}

// В update_parameters: читать GuardrailConfig вместо хардкода
pub fn update_parameters(ctx: Context<UpdateParameters>, ...) -> Result<()> {
    let config = &ctx.accounts.guardrail_config;
    require!(new_rate >= config.min_rate_bps, LendError::RateTooLow);
    require!(new_rate <= config.max_rate_bps, LendError::RateTooHigh);
    // ...
}
```

**AI Agent (validator.py) — добавить hash sync:**
```python
async def validate_with_sync(self, decision, pool_state, guardrail_config):
    """Validate decision AND verify config sync."""
    
    # 1. Вычислить hash локального конфига
    local_hash = sha256(self.config.to_bytes())
    
    # 2. Сравнить с on-chain hash
    if local_hash != guardrail_config.config_hash:
        logger.error("GUARDRAIL DESYNC! Local != on-chain. Stopping.")
        return False, "Config desync detected"
    
    # 3. Обычная валидация
    return self._validate_bounds(decision, guardrail_config)
```

**Frontend — Guardrails Status на дашборде:**
```
┌── Guard Rails ────────────────────────────────────┐
│ Layer 1: AI Prompt         ✅ Active              │
│ Layer 2: Python Validator  ✅ Synced (hash match) │
│ Layer 3: On-chain PDA      ✅ Active              │
│ Layer 4: Emergency Freeze  ✅ Ready               │
│ Layer 5: Auto-rate         ✅ Ready               │
│                                                    │
│ Rate: 1% — 20%  |  Collateral: 120% — 200%       │
│ Max change: 20%  |  Cooldown: 10 min              │
│ Config hash: 7a3f...2b1c                          │
│ Last updated: 2 hours ago by authority             │
└───────────────────────────────────────────────────┘
```

### Проверка
```
1. Инициализировать GuardrailConfig PDA → config_hash вычислен
2. AI цикл → validator проверяет hash → match → OK
3. Authority обновляет min_rate → новый hash on-chain
4. AI цикл → hash mismatch → STOP → логирует "desync"
5. AI подгружает новый конфиг → hash match → продолжает
```

### Для жюри:
> "5 уровней защиты. Guardrails не захардкожены — они в отдельном PDA,
> обновляемом governance. Python validator сверяет hash с on-chain
> перед каждым решением. Рассинхрон = AI останавливается.
> Ни один конкурент на Colosseum этого не делает."

---

## Степ 34 — AI Dry-Run Simulation
**Время:** ~1.5 часа
**Приоритет:** СРЕДНИЙ — показывает transparency AI решений
**Источник:** [SolSkill](https://github.com/caiovicentino/solskill) — simulate endpoint

### Проблема

Юзер видит: "AI поменял ставку 5% → 6.5%". Но не понимает ПОЧЕМУ
и ЧТО БУДЕТ если ставка изменится. Нет прозрачности.

### Решение: Simulate Before Execute

Каждый AI цикл СНАЧАЛА симулирует эффект решения, потом исполняет.
Юзер может в любой момент запустить "What-If" симуляцию на фронте.

**Backend — новый endpoint:**
```
POST /api/ai/simulate
Body: { "new_rate_bps": 650, "new_collateral_bps": 15000 }

Response: {
  "impact": {
    "utilization_change": "+3.2%",    // 45% → 48.2%
    "borrower_cost_change": "+$12/month per $1000",
    "depositor_yield_change": "+$8/month per $1000",
    "positions_at_risk": 2,           // позиций приблизятся к ликвидации
    "estimated_tvl_impact": "-$5,000", // юзеры могут выйти
    "protocol_revenue_change": "+$150/month"
  },
  "risk_assessment": {
    "level": "low",
    "details": "Rate increase within normal range, no positions endangered"
  },
  "ai_reasoning": "RSI=72 overbought, raising rate to cool borrowing demand"
}
```

**AI Agent — simulate в orchestrator:**
```python
async def simulate_decision(self, decision, pool_state):
    """Simulate impact BEFORE executing."""
    new_rate = decision["interest_rate_bps"]
    current_rate = pool_state["interest_rate_bps"]
    
    # Estimate borrowing cost change
    rate_delta = (new_rate - current_rate) / 10000
    borrower_impact = pool_state["total_borrows"] * rate_delta / 12
    
    # Count positions at risk
    positions = await self.reader.get_all_positions()
    at_risk = sum(1 for p in positions 
                  if p.health_factor < 1.2 and new_rate > current_rate)
    
    return {
        "utilization_change": self._estimate_util_change(decision, pool_state),
        "borrower_cost_change": borrower_impact,
        "positions_at_risk": at_risk,
        ...
    }
```

**Frontend — "What-If" панель на AI Decisions:**
```
┌── AI Rate Simulator ─────────────────────────────────┐
│                                                       │
│  Current rate: 5.00%                                  │
│  Simulate new rate: [___6.50___] %                    │
│                                                       │
│  [Run Simulation]                                     │
│                                                       │
│  ┌─ Impact Preview ──────────────────────────────┐   │
│  │ Utilization:     45% → 48.2% (+3.2%)          │   │
│  │ Borrower cost:   +$12/mo per $1,000           │   │
│  │ Depositor yield: +$8/mo per $1,000            │   │
│  │ Positions at risk: 2 of 60                     │   │
│  │ Protocol revenue: +$150/mo                     │   │
│  │ Risk: LOW ✅                                   │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  Last AI simulation (auto, before update):            │
│  "RSI=72 overbought → rate 5%→6.5% → 2 positions     │
│   approach risk zone, but overall protocol health OK"  │
└──────────────────────────────────────────────────────┘
```

### Проверка
```
1. POST /api/ai/simulate → получаем impact preview
2. Frontend → ввести ставку → Run Simulation → показывает эффект
3. AI цикл → симуляция записывается в лог перед execution
4. positions_at_risk > 10 → AI сам снижает rate change
```

### Для жюри:
> "AI не просто меняет ставки вслепую — он СИМУЛИРУЕТ эффект.
> Юзер видит impact ДО изменения. Transparency + accountability.
> Ни SolSkill, ни AgentVault этого не показывают на фронте."

---

## Финальная сводка всех степов

```
Степ  Что                                  Часы  Статус   Баллы
─────────────────────────────────────────────────────────────────
 1-15  Базовый MVP                          48    ✅ DONE   базовые
 16    Fix bugs                              2    ✅ DONE   Technical +3
 17    AI active actions                     3    ✅ DONE   Innovation +5
 18    ML upgrade (RandomForest+backtest)    3    ✅ DONE   Innovation +3
 19    Sentiment (noise filter)              2    ✅ DONE   Innovation +2
 20    README + Demo + Presentation          3    ✅ DONE   Docs +5
 21    Submit Colosseum                      1    ⬜ TODO   ОБЯЗАТЕЛЬНО
 22    Health Factor + Partial Liq + Keeper  2.5  ⬜ TODO   Innovation +5
 23    Danger Counter (auto-rate)            1.5  ⬜ TODO   Innovation +3
 24    MEV + Production Readiness            1.5  ⬜ TODO   Technical +2
 25    Pyth Oracle on-chain                  1.5  ⬜ TODO   Use of Solana +3
 26    Role Separation + Viewing Keys        2    ⬜ TODO   Innovation +3
 27    Token-2022 + Arcium Roadmap           1    ⬜ TODO   Innovation +2
 28    Stealth Deposits (ECDH Privacy)       2.5  ⬜ TODO   Innovation +7 🔥
 29    Viewing Keys + Compliance Dashboard   2    ⬜ TODO   Innovation +5 🔥
 30    Leaderboard + Keeper Rankings         1.5  ⬜ TODO   UX +3
 31    Position Transfer (Secondary Market)  2    ⬜ TODO   Innovation +4
 32    Model Reputation (Self-Improving AI)  1.5  ⬜ TODO   AI +5 🔥
 33    Dual-Layer Guardrails (PDA + Hash)    1.5  ⬜ TODO   Technical +4 🔥
 34    AI Dry-Run Simulation                 1.5  ⬜ TODO   AI +3
─────────────────────────────────────────────────────────────────
                                       ИТОГО: ~84.5 часа всего
                                       Осталось: ~24 часов

```

## Стратегия: что делает нас УНИКАЛЬНЫМИ

```
Конкуренты на Colosseum:              Мы:
──────────────────────────             ──────────────────────────────
YieldSage: LSTM заглушка              ✓ 5 ML моделей + dynamic weights
SolSkill: if/else правила             ✓ Gemini + QuantReport pipeline
AgentVault: LLM-чат без ML            ✓ Self-improving AI (model reputation)
Yumi Finance: 0 AI, выиграл DeFi      ✓ 5-level guard rails + PDA config
Lending Monitor: health check only     ✓ AI liquidation + price + freeze
SOLPRISM: commit-reveal паттерн        ✓ Dual-layer hash sync validation
CrewDegen: трейды каждые 30 мин        ✓ 11-min cycle + dry-run simulation
```

## Приоритет реализации (что делать первым)

```
ПОРЯДОК ДЕЙСТВИЙ:
──────────────────────────────────────────────────────────────

БЛОК A — "Production DeFi" (4ч, виден на фронте):
  1. Степ 22: Health Factor + Partial Liq + Keeper    2.5ч
     → Health bar на дашборде, partial liq в activity
  2. Степ 23: Danger Counter (auto-rate)              1.5ч
     → Protocol Status badge на дашборде

БЛОК B — "AI Intelligence" (4.5ч, КОНКУРЕНТНОЕ ПРЕИМУЩЕСТВО):
  3. Степ 32: Model Reputation Tracking                1.5ч
     → AI Model Performance виджет, dynamic weights
  4. Степ 33: Dual-Layer Guardrails PDA                1.5ч
     → Guard Rails Status виджет, 5-level protection
  5. Степ 34: AI Dry-Run Simulation                    1.5ч
     → What-If панель на AI Decisions странице

БЛОК C — "Privacy Layer" (4.5ч, УНИКАЛЬНОСТЬ):
  6. Степ 28: Stealth Deposits                        2.5ч
     → "Private Deposit" toggle, Privacy Stats виджет
  7. Степ 29: Viewing Keys + Audit View               2ч
     → Access вкладка, /audit?key=... страница

БЛОК D — "Engagement + Market" (3.5ч):
  8. Степ 30: Leaderboard                             1.5ч
     → Новая страница /leaderboard, rank виджет
  9. Степ 31: Position Transfer                        2ч
     → Transfer кнопка на позиции, activity feed

БЛОК E — "Infrastructure + Submit" (5ч):
 10. Степ 25: Pyth Oracle                             1.5ч
 11. Степ 24: MEV + Checklist                         1.5ч
 12. Степ 27: Arcium + Token-2022 в Roadmap            1ч
 13. Степ 21: SUBMIT                                   1ч

Если времени мало → A + B + 21
AI Intelligence + Production DeFi = победа
```
