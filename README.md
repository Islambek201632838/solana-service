# SolanaAI Lend

**AI-Powered Adaptive Lending Protocol on Solana**

Лендинг-протокол где AI (Gemini) автономно управляет процентными ставками, залоговыми коэффициентами и лимитами — адаптируясь к рынку в реальном времени, а смарт-контракт жёстко ограничивает AI рамками безопасности.

> Всё работает на **Solana Devnet** — никаких реальных денег.

---

## Проблема

Существующие DeFi лендинг-протоколы (Aave, Compound) используют **статичные формулы** для расчёта ставок:
- Параметры меняются только через голосование (дни/недели)
- Протоколы не реагируют на резкие изменения рынка
- Ставки не отражают реальный рыночный риск

## Решение

AI-агент каждые 11 минут:
1. Собирает рыночные данные (CoinGecko, Solana RPC)
2. Считает технические индикаторы (RSI, MACD, Bollinger, ATR)
3. Запускает ML модели (RandomForest, IsolationForest, EWMA)
4. Анализирует новости через Gemini (sentiment с фильтрацией шума)
5. Принимает решение и отправляет on-chain транзакцию
6. Обновляет цену SOL на блокчейне
7. Может ликвидировать позиции и заморозить протокол при аномалиях

Смарт-контракт **жёстко ограничивает** AI — ставка 1-20%, залог 120-200%, макс изменение 20% за раз, cooldown 10 мин.

---

## Архитектура

```
                      ПОЛЬЗОВАТЕЛИ
                      │         │
                Лендер│         │Заёмщик
                      ▼         ▼
           ┌──────────────────────────┐
           │   FRONTEND (React+Vite)  │
           │   Adaptive Desktop+Mobile│
           └──────┬──────────┬────────┘
                  │          │
   REST/WebSocket │          │ Phantom Wallet
   (через nginx)  │          │ (подпись TX)
                  ▼          ▼
        ┌──────────────┐  ┌────────────────────────┐
        │  FastAPI      │  │  Solana DEVNET         │
        │  Backend      │  │  Smart Contract        │
        │  + WebSocket  │  │  (Anchor/Rust)         │
        └───┬───────────┘  └───────────▲────────────┘
            │                          │
            ▼                          │
   ┌────────────────────────────┐      │
   │       AI AGENT             │──────┘
   │   ┌─────────────────────┐  │
   │   │ Data → Quant → ML   │  │  Каждые 11 мин:
   │   │ → Sentiment → Gemini│  │  update_parameters TX
   │   │ → Validate → TX     │  │  set_sol_price TX
   │   └─────────────────────┘  │  liquidate (при необходимости)
   └────────────────────────────┘  emergency_freeze (при аномалии)
```

## Технологии

| Компонент | Стек |
|-----------|------|
| Контракт | Rust + Anchor 0.32.1 (14 инструкций) |
| AI Agent | Python 3.12 + Gemini 2.0 Flash + RandomForest + IsolationForest + EWMA |
| Backend | FastAPI + WebSocket + aiosqlite |
| Frontend | React 19 + Vite + TailwindCSS + Recharts + Solana Wallet Adapter |
| Sentiment | CryptoPanic + CoinGecko + Gemini NLP (шум vs серьёзные события) |
| Инфра | Docker Compose + Nginx reverse proxy |
| i18n | Русский + Английский (UI + AI reasoning) |

---

## AI Decision — что внутри каждого решения

Каждые 11 минут AI генерирует решение. Вот что оно содержит:

### Основные параметры

| Поле | Описание |
|------|----------|
| **interest_rate_bps** | Процентная ставка (500 = 5%) — AI меняет в рамках [1%-20%] |
| **collateral_ratio_bps** | Залоговый коэффициент (15000 = 150%) — сколько SOL нужно для займа |
| **confidence** | Уверенность AI в решении (0-100%) |
| **risk_level** | low / medium / high / critical |
| **risk_score** | Числовой риск (0-100), композит из 5 факторов |
| **reasoning_en / reasoning_ru** | Объяснение решения на двух языках |

### Технические индикаторы (Quant Engine)

| Индикатор | Что измеряет | Как влияет |
|-----------|-------------|------------|
| **RSI** (0-100) | Перекупленность/перепроданность | >70 = скоро падение → повысить залог |
| **MACD** | Тренд (bullish/bearish/neutral) | Bearish → повысить ставку |
| **Bollinger Bands** | Цена в норме или за пределами | Above → перегрев → защита |
| **ATR** | Волатильность | High → повысить залог |
| **EMA Crossover** | Краткосрочный тренд | Bearish cross → осторожность |

### ML модели

| Модель | Тип | Что делает |
|--------|-----|------------|
| **RandomForest** | Классификатор | Прогноз: up/down/sideways + вероятности + feature importance |
| **IsolationForest** | Детектор аномалий | Обнаруживает ненормальное поведение рынка |
| **EWMA** | Волатильность | Прогноз волатильности (low/medium/high) |
| **Risk Scorer** | Композит | Объединяет все сигналы в единый risk_score 0-100 |
| **Utilization Predictor** | Прогноз | Предсказывает утилизацию пула |

### Sentiment (анализ новостей)

| Поле | Описание |
|------|----------|
| **sentiment_score** | Настроение рынка (-1.0 до +1.0) |
| **sentiment_severity** | noise / notable / serious / critical |
| **summary** | Краткая сводка на EN и RU |

**Фильтрация шума:** Твиты Маска/Трампа, мемы, хайп → severity="noise" → ИГНОРИРУЕТСЯ.
Серьёзные события (регуляции, санкции, хаки) → severity="serious"/"critical" → ВЛИЯЕТ на решение.

### AI Active Actions (не только параметры)

| Действие | Когда | TX |
|----------|-------|-----|
| **update_parameters** | Каждый цикл | Меняет ставку, залог, лимит |
| **set_sol_price** | Каждый цикл | Обновляет цену SOL on-chain |
| **liquidate** | Позиция undercollateralized | Ликвидирует позицию |
| **emergency_freeze** | risk > 90 или аномалия | Замораживает протокол |

---

## Guard Rails (защита от ошибок AI)

```
4 уровня защиты:

Уровень 1: Промпт       — Gemini получает жёсткие рамки
Уровень 2: Validator     — Python проверяет ДО отправки TX (11 правил)
Уровень 3: Контракт      — Solana проверяет В МОМЕНТ исполнения
Уровень 4: Emergency     — authority может заморозить, AI может freeze при аномалии

Правила контракта:
├── Ставка: [min, max] границы (по умолчанию 1%-20%)
├── Залог: [min, max] границы (120%-200%)
├── Изменение за раз: ≤ 20% от текущего значения
├── Cooldown: 10 минут между обновлениями
├── Только AI-агент может вызвать update_parameters (has_one constraint)
├── Withdraw и repay ВСЕГДА доступны (даже при freeze)
└── On-chain лог: reasoning + confidence + risk_level
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

# Frontend:  http://your-ip (через nginx)
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
| GET | `/api/pool/stats` | Статистика (USD) |
| GET | `/api/decisions/` | AI решения (пагинация, фильтр risk_level) |
| GET | `/api/decisions/{id}` | Одно решение (с ML метриками) |
| GET | `/api/analytics/rate-history` | История ставок |
| GET | `/api/analytics/risk-history` | История рисков |
| WS | `/ws` | Real-time обновления |

---

## Смарт-контракт: инструкции

| Инструкция | Кто | Описание |
|------------|-----|----------|
| `initialize_pool` | Authority | Создание пула |
| `set_sol_price` | Authority / AI | Обновление цены SOL/USD |
| `deposit` | User | Внести aiUSDC |
| `withdraw` | User | Вывести aiUSDC (всегда доступно) |
| `deposit_collateral` | User | Внести SOL залог |
| `withdraw_collateral` | User | Забрать SOL (если нет займа) |
| `borrow` | User | Займ aiUSDC под SOL |
| `repay` | User | Вернуть aiUSDC (всегда доступно) |
| `accrue_interest` | Anyone | Начислить проценты |
| `liquidate` | Anyone / AI | Ликвидация |
| `update_parameters` | AI Agent | AI меняет параметры |
| `emergency_freeze` | Authority | Заморозка |
| `ai_emergency_freeze` | AI Agent | AI заморозка при аномалии |
| `emergency_unfreeze` | Authority | Разморозка |

---

## Демо-сценарии

### Сценарий 1: Нормальная работа
1. Дашборд: ставка 4.8%, mood=Calm, deposits=$10K
2. Ждём 11 мин → AI цикл → ставка изменилась
3. AI Decisions: RSI=56, MACD=bullish, risk=low → "Снизил ставку для привлечения заёмщиков"
4. TX ссылка → Solana Explorer → proof on-chain

### Сценарий 2: Guard rails
1. AI пытается поставить ставку 50% → контракт отклоняет: RateTooHigh
2. AI пытается обновить раньше 10 мин → CooldownActive
3. Чужой кошелёк пытается вызвать update_parameters → Unauthorized

### Сценарий 3: Emergency
1. Risk score > 90 → AI вызывает emergency_freeze
2. Протокол заморожен → deposit/borrow заблокированы
3. Withdraw/repay работают (пользователи могут забрать деньги)
4. Authority вызывает emergency_unfreeze → протокол работает

---

## Переменные окружения

```bash
# Solana
PROGRAM_ID=...              # ID задеплоенной программы
POOL_AUTHORITY=...          # Pubkey authority
SOLANA_RPC_URL=https://api.devnet.solana.com

# AI
GEMINI_API_KEY=...          # Google Gemini API
GEMINI_MODEL=gemini-2.0-flash

# Security (генерировать: openssl rand -hex 32)
JWT_SECRET=...
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
```

---

## Критерии хакатона

| Критерий (баллы) | Как закрываем |
|---|---|
| **Product & Idea (20)** | Реальная проблема — статичные DeFi. AI адаптирует параметры |
| **Technical (25)** | Anchor контракт + AI Agent (Gemini + RandomForest + EWMA) + FastAPI + React |
| **Use of Solana (15)** | 14 инструкций, PDA, CPI, on-chain logs, events, guard rails |
| **Innovation (15)** | Trustless AI (контракт контролирует AI), sentiment filter, 4 уровня защиты |
| **UX (10)** | Adaptive desktop+mobile, RU/EN, AI reasoning на двух языках |
| **Demo (10)** | Live devnet, real TX, Solana Explorer proof |
| **Docs (5)** | README, архитектура, API docs, Swagger |

---

## Team

- **Islambek** — Full-stack + Blockchain
- **Bekbolat** — Full-stack + Blockchain