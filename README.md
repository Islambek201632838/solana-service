# SolanaAI Lend

**AI-Powered Adaptive Lending Protocol on Solana**

Лендинг-протокол где AI-агент (Gemini + 5 ML моделей) автономно управляет процентными ставками, залоговыми коэффициентами и лимитами — адаптируясь к рынку в реальном времени. Смарт-контракт жёстко ограничивает AI 7-уровневой защитой.

> **Solana Devnet** — тестовая сеть, никаких реальных денег.

---

## Проблема

DeFi лендинг-протоколы (Aave, Compound, Marginfi) используют **статичные формулы**:
- Параметры меняются через governance голосование (дни/недели)
- Не реагируют на резкие изменения рынка (крэши, волатильность)
- Одинаковые условия для всех юзеров, независимо от кредитной истории

## Решение

AI-агент каждые **2 минуты**:
1. Собирает рыночные данные (CoinGecko API, Solana RPC)
2. Считает 5 технических индикаторов (RSI, MACD, Bollinger, ATR, EMA)
3. Запускает 6 ML моделей (RandomForest, IsolationForest, EWMA, RiskScorer, CrashDetector, UtilizationPredictor)
4. Анализирует новости через Gemini NLP (с фильтрацией шума)
5. Отслеживает тренд утилизации (rising/falling/stable)
6. Принимает решение и отправляет on-chain транзакцию
7. Обновляет цену SOL, мониторит позиции, может ликвидировать и заморозить

При недоступности Gemini — **ML-only fallback** (протокол НИКОГДА не останавливается).

---

## Архитектура

```
                     ПОЛЬЗОВАТЕЛИ
                     |         |
               Лендер|         |Заёмщик
                     v         v
          +---------------------------+
          |  FRONTEND (React + Vite)  |
          |  Dashboard, Activity,     |
          |  AI Decisions, Risk,      |
          |  Simulator, Leaderboard   |
          +-----+------------+-------+
                |            |
  REST/WebSocket|            | Phantom Wallet
  (nginx proxy) |            | (TX signing)
                v            v
       +--------------+  +------------------------+
       |  FastAPI      |  |  Solana DEVNET         |
       |  Backend      |  |  Smart Contract        |
       |  + WebSocket  |  |  (Anchor/Rust)         |
       +---+-----------+  +----------^-------------+
           |                         |
           v                         |
  +-----------------------------+    |
  |       AI AGENT              |----+
  |  +------------------------+|
  |  | CoinGecko -> Quant     ||  Каждые 2 мин:
  |  | -> ML (6 моделей)      ||  set_sol_price TX
  |  | -> CrashDetector       ||  update_parameters TX
  |  | -> Sentiment (Gemini)  ||  liquidate (если нужно)
  |  | -> Preemptive Engine   ||  emergency_freeze (аномалия)
  |  | -> Validate -> TX      ||
  |  +------------------------+|
  +-----------------------------+
```

> Подробная архитектура: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Технологии

| Компонент | Стек |
|-----------|------|
| Контракт | Rust + Anchor 0.32.1 (21 инструкция, 3 PDA) |
| AI Agent | Python 3.12 + Gemini 2.0 Flash + 7 ML моделей + ML fallback |
| Backend | FastAPI + WebSocket + aiosqlite + 10 API routers |
| Frontend | React 19 + Vite + TailwindCSS + Recharts |
| Инфра | Docker Compose (5 сервисов) + Nginx reverse proxy |
| i18n | Русский + Английский (UI + AI reasoning) |

---

## Ключевые фичи

### DeFi Production
- **Partial Liquidation** — ликвидируется минимум чтобы вернуть health > 1.1 (как Aave v3)
- **Keeper Rewards** — 1% от погашенного долга ликвидатору
- **Health Factor** — on-chain расчёт + прогресс-бар на фронте
- **Insurance Fund** — 10% от interest -> резерв на bad debt
- **Withdrawal Rate Limit** — per-epoch лимит на вывод (circuit breaker)
- **Loyalty LTV Discount** — Bronze/Silver/Gold/Platinum, лучшие условия лояльным юзерам
- **Adaptive Cooldown** — 60s в кризисе, 10 мин нормально, auto-expire через 30 мин
- **Position Transfer** — two-step transfer позиций (продажа с сохранением loyalty tier)
- **Role Separation** — Authority / AI Agent / Keeper с разными правами

### AI Intelligence
- **7 ML моделей**: RandomForest (тренд), IsolationForest (аномалии), EWMA (волатильность), RiskScorer (композитный риск), CrashDetector (6 сигналов крэша), UtilizationPredictor, ModelReputation (dynamic weights)
- **Dynamic LTV** — AI автоматически повышает/снижает залог по волатильности (calm/normal/storm/extreme)
- **Crash Detector** — 6 ML-сигналов → crash probability → auto-freeze при >80%
- **Preemptive Engine** — 6 триггеров → AI действует ДО проблемы
- **Model Reputation** — rolling accuracy per model, плохие модели теряют вес автоматически
- **Liquidation Predictor** — Monte Carlo 500 sims → 1h/4h/24h probability
- **Credit Score** — 5 on-chain факторов → score 0-100, персонализированный LTV
- **Gemini Fallback** — ML-only режим когда LLM недоступен (учитывает util trend)
- **Utilization Trend** — AI учитывает тренд (rising → агрессивнее, falling → мягче)
- **Sentiment Filter** — отделяет шум (мемы, хайп) от серьёзных событий

### Safety (7 уровней защиты)
1. **AI Prompt** — жёсткие рамки в промпте Gemini
2. **Python Validator** — 11 правил ДО отправки TX
3. **On-chain Guards** — контракт проверяет bounds, cooldown, max change
4. **Emergency Freeze** — AI или authority может заморозить
5. **Auto-rate (Safety Net)** — контракт САМ повышает ставку при util > 85%
6. **Insurance Fund** — резерв на покрытие bad debt
7. **GuardrailConfig PDA** — параметры защиты в отдельном on-chain аккаунте

### Frontend
- **Dashboard** — доход лендера, стоимость займа, health factor, страховой фонд, SOL цена, LTV mode badge, liquidation queue
- **Deposit / Borrow** — формы с калькулятором стоимости + Credit Score виджет
- **Activity** — пагинация + фильтры (все/займы/возвраты/залоги) с количествами
- **AI Decisions** — фильтр по risk level с количеством + Model Performance виджет
- **Simulator** — "что если" для AI решений
- **Leaderboard** — топ депозиторов, заёмщиков, keepers

---

## Guard Rails

```
7 уровней защиты:

Уровень 1: Промпт       — Gemini получает жёсткие рамки (ставка 1-20%, залог 120-200%)
Уровень 2: Validator     — Python проверяет ДО отправки TX (11 правил)
Уровень 3: Контракт      — Solana проверяет В МОМЕНТ исполнения
Уровень 4: Emergency     — authority / AI может заморозить протокол
Уровень 5: Auto-rate     — контракт САМ повышает ставку при util > 85%
Уровень 6: Insurance     — 10% interest -> резерв на bad debt
Уровень 7: GuardrailConfig — параметры защиты в отдельном PDA

Правила контракта:
+-- Ставка: [min, max] границы (1%-20%)
+-- Залог: [min, max] границы (120%-200%)
+-- Изменение за раз: <= 20% от текущего
+-- Cooldown: 60 сек между обновлениями
+-- Только AI-агент может вызвать update_parameters
+-- Withdraw и repay ВСЕГДА доступны (даже при freeze)
+-- On-chain лог: reasoning + confidence + risk_level
```

---

## Быстрый старт

### Docker Compose (рекомендуется)

```bash
git clone https://github.com/Islambek201632838/solana-service.git
cd solana-service

cp .env.example .env
# Заполнить: GEMINI_API_KEY, PROGRAM_ID, POOL_AUTHORITY

cd docker
docker compose --env-file ../.env up --build -d

# Frontend:  http://your-ip (nginx)
# Swagger:   http://your-ip/api/docs
# WebSocket: ws://your-ip/ws
```

### Без Docker

```bash
# Контракт
anchor build && anchor deploy --provider.cluster devnet

# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --port 8000

# AI Agent
cd ai-agent && pip install -r requirements.txt
python main.py

# Frontend
cd frontend && npm install && npm run dev
```

---

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/health` | Статус |
| GET | `/api/pool/state` | Состояние пула (on-chain) |
| GET | `/api/pool/stats` | Статистика (USD, APY, insurance) |
| GET | `/api/decisions/` | AI решения (пагинация, фильтр risk_level) |
| GET | `/api/analytics/rate-history` | История ставок |
| GET | `/api/analytics/risk-history` | История рисков |
| GET | `/api/activity/` | Операции (пагинация, offset) |
| GET | `/api/risk/dashboard` | Risk dashboard (все метрики) |
| GET | `/api/risk/liquidation-queue` | Очередь ликвидаций |
| GET | `/api/leaderboard/{type}` | Лидерборд (depositors/borrowers/keepers) |
| POST | `/api/ai/simulate` | Симуляция AI решения |
| GET | `/api/system/status` | Production readiness |
| GET | `/api/credit-score/{wallet}` | Credit score (5 факторов) |
| GET | `/api/ai/model-stats` | ML model performance stats |
| GET | `/api/risk/predict/{wallet}` | Liquidation probability (Monte Carlo) |
| WS | `/ws` | Real-time обновления |

---

## Смарт-контракт

| Инструкция | Кто | Описание |
|------------|-----|----------|
| `initialize_pool` | Authority | Создание пула |
| `set_sol_price` | Authority / AI | Обновление цены SOL/USD |
| `deposit` / `withdraw` | User | Депозит / вывод aiUSDC |
| `deposit_collateral` / `withdraw_collateral` | User | Залог SOL |
| `borrow` / `repay` | User | Займ / возврат aiUSDC |
| `accrue_interest` | Anyone | Начисление процентов |
| `liquidate` | Anyone / AI | Partial liquidation + keeper reward |
| `update_parameters` | AI Agent | AI меняет ставку, залог, лимит |
| `emergency_freeze` / `unfreeze` | Authority | Заморозка |
| `ai_emergency_freeze` | AI Agent | AI заморозка при аномалии |
| `get_health_factor` | Anyone | View health factor позиции |
| `init_guardrails` / `update_guardrails` | Authority | Управление guard rails PDA |
| `migrate_pool` | Authority | Миграция layout пула |
| `cover_bad_debt` | Authority | Покрытие bad debt из insurance |
| `activate_crisis` / `deactivate_crisis` | Authority/AI | Adaptive cooldown (crisis mode) |
| `transfer_position` / `cancel_transfer` | User | Two-step position transfer |
| `set_roles` | Authority | Назначить AI agent / keeper authority |

---

## Security

### AI Agent Keypair
- Devnet: plain JSON file (`keys/ai-agent.json`)
- Mainnet plan: HSM (Hardware Security Module) или multisig
- Agent can ONLY: update_parameters, set_sol_price, liquidate, freeze
- Agent CANNOT: withdraw funds, close accounts, change authority

### Oracle
- Devnet: AI agent sets price via CoinGecko -> set_sol_price
- Mainnet plan: Pyth Oracle on-chain + 3-level fallback (Pyth -> AI/CoinGecko -> last known)
- Staleness check: price > 5 min -> operations limited

### Known Limitations (devnet)
- No audit performed
- Single oracle source (CoinGecko via AI)
- AI agent keypair not in HSM
- No rate limiting on RPC calls

---


## Team

- **Islambek** — Full-stack + Blockchain
- **Bekbolat** — Full-stack + Blockchain