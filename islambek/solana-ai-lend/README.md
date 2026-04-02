# SolanaAI Lend

**AI-Powered Adaptive Lending Protocol on Solana**

Лендинг-протокол где AI (Gemini) автономно управляет процентными ставками, залоговыми коэффициентами и лимитами — адаптируясь к рынку в реальном времени, а смарт-контракт жёстко ограничивает AI рамками безопасности.

> Всё работает на **Solana Devnet** — никаких реальных денег.

---

## Архитектура

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  Solana RPC  │
│  React+Vite  │◀────│   FastAPI    │◀────│   (devnet)   │
│  TailwindCSS │  WS │  + WebSocket │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                            │                     │
                     ┌──────┴───────┐     ┌───────┴──────┐
                     │   SQLite     │     │ Anchor Smart │
                     │ (decisions)  │     │   Contract   │
                     └──────────────┘     └───────┬──────┘
                                                  │
                     ┌────────────────────────────┘
                     │
              ┌──────┴───────┐
              │   AI Agent   │
              │ Python async │
              │  + Gemini    │
              │  + sklearn   │
              └──────────────┘
```

## Технологии

| Компонент | Стек |
|-----------|------|
| Контракт | Rust + Anchor 0.32.1 (12 инструкций, 23 теста) |
| AI Agent | Python 3.12 + Gemini + sklearn + numpy + aiohttp |
| Backend | FastAPI + WebSocket + aiosqlite (WAL mode) |
| Frontend | React 19 + Vite + TailwindCSS + Recharts + Wallet Adapter |
| Инфра | Docker Compose + Nginx |

## Тесты

| Компонент | Тестов | Что тестирует |
|-----------|--------|---------------|
| Anchor контракт | 23 | init, deposit, withdraw, collateral, borrow, repay, liquidate, AI update, freeze |
| Data Collector | 5 | CoinGecko API, pool deserialization |
| Quant Engine | 23 | RSI, MACD, Bollinger, ATR, EMA crossover, utilization curve |
| ML Engine | 18 | anomaly, trend, volatility, risk scorer, signal aggregator |
| Gemini + Validator | 15 | prompt parsing, validation (11 rules), live Gemini call |
| Backend API | 15 | REST endpoints, WebSocket, pagination, error handling |
| Frontend | 25 | components, forms, layout, responsive |
| **Итого** | **124** | |

---

## Быстрый старт

### Вариант 1: Docker Compose (рекомендуется)

```bash
# 1. Клонировать
git clone https://github.com/Islambek201632838/solana-service.git
cd solana-service/islambek/solana-ai-lend

# 2. Настроить .env
cp .env.example .env
# Заполнить GEMINI_API_KEY, POOL_AUTHORITY, JWT_SECRET

# 3. Запустить всё
cd docker
docker compose up --build

# Результат:
#   Frontend:  http://localhost:3000
#   Backend:   http://localhost:8000
#   Swagger:   http://localhost:8000/docs
#   WebSocket: ws://localhost:8000/ws
```

### Вариант 2: Без Docker (для разработки)

#### Требования

| Инструмент | Версия |
|------------|--------|
| Node.js | >= 18 |
| Rust | >= 1.75 |
| Solana CLI | >= 2.0 |
| Anchor CLI | 0.32.1 |
| Python | >= 3.12 |

#### Установка тулчейна

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1 && avm use 0.32.1
```

#### Настройка Solana

```bash
solana config set --url devnet
solana-keygen new --outfile keys/deployer.json
solana-keygen new --outfile keys/ai-agent.json
solana airdrop 2 --keypair keys/deployer.json
```

#### Запуск компонентов

```bash
# Контракт (build + test)
anchor build
anchor test

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# AI Agent
cd ai-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
npm install
npm run dev
```

---

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/health` | Статус сервера |
| GET | `/api/pool/state` | Состояние пула (on-chain) |
| GET | `/api/pool/stats` | Статистика пула (USD) |
| GET | `/api/decisions/` | Список AI решений (пагинация, фильтр по risk_level) |
| GET | `/api/decisions/{id}` | Одно AI решение |
| GET | `/api/analytics/rate-history` | История ставок |
| GET | `/api/analytics/risk-history` | История рисков |
| WS | `/ws` | Real-time обновления пула |

Swagger UI: `http://localhost:8000/docs`

---

## Смарт-контракт: инструкции

| Инструкция | Кто вызывает | Описание |
|------------|-------------|----------|
| `initialize_pool` | Authority | Создание пула + vault PDA |
| `set_sol_price` | Authority | Установка цены SOL/USD |
| `deposit` | User | Внести aiUSDC в пул |
| `withdraw` | User | Вывести aiUSDC (даже при freeze) |
| `deposit_collateral` | User | Внести SOL как залог |
| `withdraw_collateral` | User | Забрать SOL (если нет займа) |
| `borrow` | User | Займ aiUSDC под SOL залог |
| `repay` | User | Вернуть aiUSDC (даже при freeze) |
| `accrue_interest` | Anyone | Начислить проценты |
| `liquidate` | Anyone | Ликвидация undercollateralized позиции |
| `update_parameters` | AI Agent | AI обновляет ставку/залог/лимит |
| `emergency_freeze` | Authority | Заморозка протокола |

Guard rails для AI:
- Ставка: [min, max] границы
- Изменение за раз: ≤ 20%
- Cooldown: 10 минут между обновлениями
- On-chain лог: reasoning_short + confidence + risk_level

---

## AI Agent: как работает

```
Каждые 10 минут:
  1. Сбор данных (CoinGecko + Solana RPC) — asyncio.gather
  2. Quant анализ (RSI, MACD, Bollinger, ATR) — ThreadPoolExecutor
  3. ML анализ (anomaly, trend, volatility, risk) — ThreadPoolExecutor
  4. Utilization curve (Aave-style kink model)
  5. Signal aggregator → QuantReport (голосование 5 индикаторов)
  6. Gemini → JSON решение (русский промпт)
  7. Validator → 11 проверок
  8. TX Builder → отправка update_parameters в devnet
  9. Decision Logger → SQLite + on-chain AiDecisionLog
```

Workers (отдельные процессы):
- **Price Watcher** — алерт при >5% за 5 мин
- **Health Monitor** — проверка пула каждую минуту

---

## Переменные окружения

```bash
cp .env.example .env
```

| Переменная | Описание |
|------------|----------|
| `PROGRAM_ID` | ID задеплоенной Anchor программы |
| `POOL_AUTHORITY` | Pubkey authority пула |
| `GEMINI_API_KEY` | Google Gemini API ключ |
| `JWT_SECRET` | Секрет для JWT (backend) |

---

## Структура проекта

```
solana-ai-lend/
├── programs/solana-ai-lend/src/lib.rs    # Anchor контракт (620 строк)
├── tests/solana-ai-lend.ts               # 23 Anchor теста
├── ai-agent/
│   ├── agent/
│   │   ├── data_collector.py             # Async сбор данных
│   │   ├── quant_engine.py               # RSI, MACD, Bollinger, ATR
│   │   ├── utilization_curve.py          # Aave kink model
│   │   ├── signal_aggregator.py          # Voting → QuantReport
│   │   ├── ai_engine.py                  # Gemini интеграция
│   │   ├── validator.py                  # 11 проверок решения
│   │   ├── tx_builder.py                 # Solana TX builder
│   │   ├── orchestrator.py               # Полный AI цикл
│   │   └── decision_logger.py            # SQLite логирование
│   ├── models/                           # ML модели (sklearn)
│   ├── workers/                          # Price watcher + Health monitor
│   └── tests/                            # 61 тест
├── backend/
│   ├── app/
│   │   ├── routers/                      # REST API endpoints
│   │   ├── services/                     # Solana reader + Decision service
│   │   ├── ws/                           # WebSocket manager + poller
│   │   └── models/schemas.py             # Pydantic models
│   └── tests/test_api.py                 # 15 тестов
├── frontend/
│   ├── src/
│   │   ├── components/                   # Dashboard, Layout, Forms
│   │   ├── pages/                        # Deposit, Borrow, AiDecisions, Analytics
│   │   ├── hooks/                        # usePool, useWebSocket, useMediaQuery
│   │   └── __tests__/                    # 25 тестов
│   └── Dockerfile
├── docker/
│   ├── docker-compose.yml                # Все сервисы
│   └── nginx.conf                        # Reverse proxy
└── .env.example
```

---

## Лицензия

MIT
