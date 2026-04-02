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
 16   Fix critical bugs                    2    ВЫСОКИЙ     Technical +3
 17   AI active actions (liquidate+price)  3    ВЫСОКИЙ     Innovation +5, Use of Solana +3
 18   ML upgrade (RF + metrics + backtest) 3    СРЕДНИЙ     Innovation +3, Technical +2
 19   Sentiment analysis                   2    СРЕДНИЙ     Innovation +2
 20   README + Demo + Presentation         3    ВЫСОКИЙ     Documentation +5, Demo +5
 21   Submit                               1    КРИТИЧЕСКИЙ  Без этого = 0 баллов
──────────────────────────────────────────────────────────────────
                                     ИТОГО: 14 часов

Порядок приоритетов:
  1. Степ 16 (баги) — сначала починить
  2. Степ 17 (AI actions) — главный буст для Innovation
  3. Степ 20 (README + demo) — Documentation баллы
  4. Степ 21 (submit) — обязательно
  5. Степ 18 (ML upgrade) — если есть время
  6. Степ 19 (sentiment) — бонус
```
