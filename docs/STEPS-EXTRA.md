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
 27    Token-2022 + Roadmap (презентация)    1    ⬜ TODO   Innovation +2
─────────────────────────────────────────────────────────────────
                                       ИТОГО: ~72 часа всего
                                       Осталось: ~11.5 часов

Приоритет оставшихся:
  1. Степ 22 (Health+Partial Liq)  — MUST: production отличие
  2. Степ 23 (Danger Counter)      — MUST: "работает без AI"
  3. Степ 25 (Pyth Oracle)         — SHOULD: реальные цены
  4. Степ 21 (Submit)              — MUST: без этого = 0
  5. Степ 26 (Roles)               — NICE: security
  6. Степ 24 (MEV+Checklist)       — NICE: mainnet readiness
  7. Степ 27 (Token-2022)          — BONUS: roadmap в презе
```
