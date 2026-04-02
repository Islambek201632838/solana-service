# SolanaAI Lend — План реализации (15 степов)

Дедлайн: **7 апреля 2026, 23:59 GMT+5**
Общий объём: **~48 часов**

---

## Фаза 1: Смарт-контракт (Anchor/Rust)

### Степ 1 — Project Setup + Scaffold
**Время:** ~2 часа (rust toolchain + anchor install может занять время)
**Задача:**
- `anchor init solana-ai-lend`
- Настроить `Anchor.toml` → cluster = devnet
- `solana config set --url devnet`
- `solana-keygen new` → deployer + ai-agent keypairs
- `solana airdrop 2` → тестовые SOL
- Инициализировать `ai-agent/` → python venv, requirements.txt
- Инициализировать `frontend/` → `npm create vite@latest` с React + TS
- Инициализировать `backend/` → FastAPI scaffold

**Security (обязательно с первого дня):**
- Создать `.env.example` с placeholder-ами (REPLACE_ME) → коммитить
- Создать `.env` с реальными значениями → НЕ коммитить (.gitignore)
- Сгенерировать сильные пароли:
  - `openssl rand -hex 32` для POSTGRES_PASSWORD
  - `openssl rand -base64 48` для JWT_SECRET
- Keypairs в `keys/` → в .gitignore
- Проверить: `git status` — ни один .env или .json ключ не tracked

**Результат:** Проект компилируется (`anchor build`), devnet подключён, все 4 части существуют, секреты в .env.

**Файлы:**
```
solana-ai-lend/
├── Anchor.toml
├── .env.example                          (с REPLACE_ME — в git)
├── .env                                  (с реальными ключами — НЕ в git)
├── .gitignore                            (секреты исключены)
├── programs/solana-ai-lend/src/lib.rs
├── ai-agent/main.py
├── ai-agent/.env                         (GEMINI_API_KEY — НЕ в git)
├── backend/main.py
├── frontend/src/App.tsx
├── docker/docker-compose.yml             (все секреты через ${VAR})
├── docker/.env                           (→ .gitignore)
├── docker/nginx.conf
└── keys/                                 (→ .gitignore)
    ├── deployer.json
    └── ai-agent.json
```

**Проверка:**
```bash
anchor build → OK
solana balance → 2+ SOL
grep -r "AIzaSy" . --exclude-dir=.git → пусто (нет ключей в коде)
cat .env.example → все значения REPLACE_ME
git status → .env и keys/ НЕ в списке
```

---

### Степ 2 — State Accounts + Initialize Pool
**Время:** ~2 часа
**Задача:**
- Определить все аккаунты: `LendingPool`, `UserPosition`, `AiDecisionLog`
- Enums: `ProtocolMood`, `RiskLevel`, `LoyaltyTier`
- Инструкция `initialize_pool` с PDA seeds
- Создать тестовый SPL-токен `aiUSDC` на devnet
- Написать тест: инициализация пула

**Результат:** `anchor test` → пул создаётся на devnet с правильными начальными параметрами.

**Ключевые аккаунты:**
```rust
LendingPool {
    authority, ai_agent, token_mint,
    total_deposits, total_borrows, available_liquidity,
    // AI-параметры
    interest_rate_bps, collateral_ratio_bps, max_borrow_limit,
    // Guard rails
    max_interest_rate_bps, min_interest_rate_bps,
    min_collateral_ratio_bps, max_collateral_ratio_bps,
    // Stats
    total_deposits_count, total_borrows_count,
    total_ai_updates, total_ai_skips,
    current_mood: ProtocolMood,
    // Meta
    last_update, update_cooldown, bump,
}
```

**Проверка:** Тест проходит, аккаунт LendingPool читается из devnet.

---

### Степ 3 — Deposit + Withdraw
**Время:** ~3 часа
**Задача:**
- Инструкция `deposit`: SPL-токен трансфер user → pool_vault (PDA)
- Инструкция `withdraw`: SPL-токен трансфер pool_vault → user (PDA signer)
- `UserPosition` — init_if_needed с PDA seeds `["position", pool, owner]`
- Обновление `total_deposits`, `available_liquidity`, `deposits_count`
- Events: `DepositEvent`, `WithdrawEvent`
- `#[derive(Accounts)]` с proper constraints: `has_one`, `seeds`, `bump`, `token::mint`, `token::authority`
- Создать и замайнить 1M aiUSDC для тестов

**Результат:** Тест — deposit 1000 aiUSDC → проверка баланса → withdraw 500 → проверка.

**Проверка:**
```
deposit 1000 → pool.total_deposits == 1000, position.deposited == 1000
withdraw 500 → pool.total_deposits == 500, position.deposited == 500
withdraw 600 → ERROR InsufficientDeposit ✓
```

---

### Степ 4 — Collateral + Borrow + Repay + Interest + Liquidate
**Время:** ~4 часа
**Задача:**
- Инструкция `deposit_collateral`: SOL transfer user → pool PDA (system_program)
- Инструкция `withdraw_collateral`: SOL transfer pool PDA → user (только если borrowed == 0)
- Инструкция `borrow`: Pyth oracle SOL/USD → конвертация залога в USD → проверка ratio
- Инструкция `repay`: возврат aiUSDC, обновление borrowed
- Инструкция `accrue_interest`: расчёт процентов по формуле simple interest
  - `interest = deposited * rate_bps * elapsed_sec / (31_557_600 * 10000)`
- Инструкция `liquidate`: Pyth oracle → проверка undercollateralized → ликвидация
  - Ликвидатор получает залог с 5% бонусом
- Events: `CollateralDepositedEvent`, `BorrowEvent`, `RepayEvent`, `LiquidationEvent`
- Pyth devnet price feed: `sol_usd_price_feed` аккаунт в LendingPool
- checked_add/checked_sub для всей математики

**Результат:** Тест — deposit_collateral SOL → borrow aiUSDC → accrue_interest → repay → withdraw_collateral.

**Проверка:**
```
deposit_collateral 2 SOL → position.collateral_sol == 2_000_000_000
borrow 100 aiUSDC при SOL=$185, залоге 2 SOL, ratio 150% → OK (залог $370 > $150)
borrow 300 aiUSDC при залоге 1 SOL → ERROR InsufficientCollateral ✓ (залог $185 < $450)
accrue_interest → position.accrued_interest > 0
repay 100 → position.borrowed == 0
withdraw_collateral 2 SOL → OK (нет активного займа)
withdraw_collateral при borrowed > 0 → ERROR HasActiveBorrow ✓
borrow > max_borrow_limit → ERROR BorrowLimitExceeded ✓
liquidate при healthy position → ERROR PositionHealthy ✓
```

---

### Степ 5 — AI update_parameters + Guard Rails + Events + Emergency
**Время:** ~4 часа
**Задача:**

**Ядро (обязательно):**
- Инструкция `update_parameters`:
  - Аргументы: rate, collateral, max_borrow, reasoning_hash, reasoning_short, confidence, risk_level
  - has_one = ai_agent (Anchor constraint)
  - Guard rails: ставка [min,max], залог [min,max], cooldown, макс изменение ≤20%
  - Создание AiDecisionLog (PDA seeds: ["decision_log", pool, update_count])
  - reasoning_short: String on-chain (≤256 chars)
  - Обновление ProtocolMood по risk_level
  - Инкремент total_ai_updates
  - Event: ParametersUpdatedEvent
- Инструкция `emergency_freeze` (owner only) → is_frozen = true
  - Event: EmergencyFreezeEvent
- Все инструкции проверяют !pool.is_frozen (кроме withdraw и repay — всегда доступны)

**Бонус (если останется время):**
- Инструкция `challenge_ai_decision` (governance-lite)

**Результат:** Тест — AI обновляет параметры → reasoning_short и mood записаны on-chain. Нарушение лимита → TX rejected. Emergency freeze → всё заблокировано.

**Проверка:**
```
update_parameters(rate=650) при текущей 500 → 30% > 20% → ERROR ChangeTooLarge ✓
update_parameters(rate=550, reasoning="RSI=72...", risk=Medium) → OK ✓
  → AiDecisionLog.reasoning_short == "RSI=72..." ✓
  → pool.current_mood == Cautious ✓
  → pool.total_ai_updates == 1 ✓
update_parameters сразу → ERROR CooldownActive ✓
update_parameters от чужого ключа → ERROR (has_one) ✓
emergency_freeze → pool.is_frozen == true ✓
borrow после freeze → ERROR ProtocolFrozen ✓
withdraw после freeze → OK (всегда доступен) ✓
```

---

## Фаза 2: AI Agent (Python async)

### Степ 6 — Config + Data Collector
**Время:** ~2 часа
**Задача:**
- `config.py` с pydantic-settings, загрузка .env (GEMINI_API_KEY)
- `data_collector.py` — async aiohttp:
  - `fetch_sol_price()` → CoinGecko
  - `fetch_pool_state()` → Solana RPC (десериализация аккаунта)
  - `fetch_jupiter_data()` → Jupiter API
  - `fetch_price_history()` → CoinGecko 24h chart
- `asyncio.gather` для параллельного сбора
- `build_context()` → объединение в dict

**Результат:** `python -m agent.data_collector` → выводит текущую цену SOL, состояние пула, историю цен.

**Проверка:**
```python
data = await collector.fetch_sol_price()
assert "sol_price" in data
assert data["sol_price"] > 0
```

---

### Степ 7 — Quant Engine (математические индикаторы)
**Время:** ~3 часа
**Задача:**
- `quant_engine.py` — чистые функции на numpy:
  - `calc_rsi(prices, period=14)` → float
  - `calc_macd(prices, fast=12, slow=26, signal=9)` → dict
  - `calc_bollinger(prices, period=20, std_dev=2)` → dict
  - `calc_atr(highs, lows, closes, period=14)` → float
  - `calc_ema_crossover(prices, fast=9, slow=21)` → str
- `utilization_curve.py`:
  - `calc_optimal_rate(utilization, params)` → dict
  - Формула Aave с kink point
- Unit тесты для каждого индикатора с известными данными

**Результат:** `pytest tests/test_quant.py` — все индикаторы считаются правильно.

**Проверка:**
```python
# RSI на известных данных
prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, ...]
rsi = calc_rsi(prices, 14)
assert 60 < rsi < 70  # известный результат для этих данных

# Utilization curve
rate = calc_optimal_rate(utilization=0.60, u_optimal=0.80, r_base=100, r_slope1=400, r_slope2=1500)
assert rate["optimal_rate_bps"] == 400  # 4.0%
```

---

### Степ 8 — ML Engine (sklearn модели)
**Время:** ~3 часа
**Задача:**
- `models/anomaly_detector.py` → IsolationForest, fit на 24h данных
- `models/trend_predictor.py` → LinearRegression, фичи: lags, RSI, MACD, volume
- `models/volatility_model.py` → EWMA (λ=0.94), volatility regime
- `models/risk_scorer.py` → взвешенная сумма (vol + trend + util + anomaly + liquidity)
- `models/utilization_predictor.py` → LinearRegression, прогноз утилизации
- `signal_aggregator.py` → сборка QuantReport из всех сигналов
  - Голосование индикаторов → recommended_direction
  - math_confidence из согласованности сигналов

**Результат:** `pytest tests/test_ml.py` — модели дают предсказания, QuantReport генерируется.

**Проверка:**
```python
report = aggregator.build_report(market_data, pool_state, technical, ml_signals, util_rec)
assert "rsi" in report
assert "risk_score" in report
assert 0 <= report["risk_score"] <= 100
assert report["recommended_rate_direction"] in ["increase", "decrease", "hold"]
```

---

### Степ 9 — Gemini Engine + Validator
**Время:** ~2 часа
**Задача:**
- `ai_engine.py`:
  - `interpret(quant_report)` → async запрос к Gemini
  - Промпт с QuantReport (НЕ сырые данные)
  - Парсинг JSON из ответа (с fallback если ```json```)
  - Retry при ошибках (макс 2 попытки)
- `validator.py`:
  - Проверка всех полей в ответе
  - rate/collateral в допустимых рамках
  - Изменение ≤ 20%
  - confidence > 50
  - risk != critical → skip

**Результат:** Тест — передаём QuantReport → Gemini возвращает валидный JSON → Validator пропускает.

**Проверка:**
```python
decision = await engine.interpret(sample_quant_report)
assert "interest_rate_bps" in decision
assert 100 <= decision["interest_rate_bps"] <= 2000
is_valid, reason = validator.validate(decision, pool_state)
assert is_valid == True
```

---

### Степ 10 — Orchestrator + TX Builder + Workers
**Время:** ~3 часа
**Задача:**
- `tx_builder.py`:
  - Построение инструкции `update_parameters`
  - Подпись ключом AI-агента
  - Отправка в devnet + получение TX hash
- `orchestrator.py`:
  - Полный цикл: данные → math → ML → QuantReport → Gemini → validate → TX
  - asyncio event loop, ThreadPoolExecutor для CPU-bound
  - Цикл каждые 10 минут
- `decision_logger.py`: запись в SQLite (off-chain) + on-chain log
- `workers/price_watcher.py`: Process 2, алерт при >5% за 5 мин
- `workers/health_monitor.py`: Process 3, проверка пула каждую минуту
- `main.py`: multiprocessing запуск всех 3 процессов

**Результат:** `python main.py` → AI агент запускается, анализирует, и РЕАЛЬНО обновляет параметры контракта на devnet.

**Проверка:**
```
[ORCHESTRATOR] Started
[PRICE WATCHER] Started
[HEALTH MONITOR] Started
[CYCLE] Fetching data... OK
[CYCLE] Quant analysis: RSI=65, MACD=bullish, risk=35
[CYCLE] Gemini decision: rate 500→520, collateral hold
[CYCLE] TX sent: 4kF2x...
[OK] Parameters updated on devnet
```

---

## Фаза 3: Backend API (FastAPI)

### Степ 11 — FastAPI + Solana Reader + REST API
**Время:** ~3 часа
**Задача:**
- `backend/app/config.py` → настройки
- `backend/app/models/schemas.py` → Pydantic модели: PoolStateResponse, AiDecisionResponse, UserPositionResponse
- `backend/app/services/solana_reader.py`:
  - Async чтение LendingPool из devnet
  - TTL кэш (30 сек)
  - Десериализация через IDL
- `backend/app/services/decision_service.py`:
  - Async SQLite для истории решений AI
  - CRUD + пагинация + фильтрация
- `backend/app/routers/`:
  - `pool.py` → GET /api/pool/state, GET /api/pool/stats
  - `decisions.py` → GET /api/decisions/, GET /api/decisions/{id}
  - `analytics.py` → GET /api/analytics/rate-history, GET /api/analytics/risk-history
  - `health.py` → GET /api/health
- CORS middleware для React
- Swagger UI автогенерация

**Результат:** `uvicorn app.main:app` → curl /api/pool/state → JSON.

**Проверка:**
```bash
curl http://localhost:8000/api/pool/state
# → {"total_deposits": 50000, "interest_rate_bps": 500, ...}

curl http://localhost:8000/api/decisions/?page=1&limit=10
# → {"items": [...], "total": 147, "page": 1}

curl http://localhost:8000/docs
# → Swagger UI
```

---

### Степ 12 — WebSocket + Real-time Updates
**Время:** ~2 часа
**Задача:**
- `backend/app/ws/manager.py`:
  - ConnectionManager (broadcast всем подключённым)
  - Подписка на события контракта через Solana WebSocket
  - Парсинг events (AiParametersUpdated, DepositEvent, etc.)
  - Broadcast в React
- Background task: poll pool state каждые 30 сек → broadcast если изменилось
- WebSocket endpoint: ws://localhost:8000/ws

**Результат:** wscat подключается → при обновлении AI → мгновенное сообщение.

**Проверка:**
```bash
wscat -c ws://localhost:8000/ws
# (ждём обновление AI)
# → {"type": "ai_update", "data": {"new_rate": 520, "reasoning": "..."}}
```

---

## Фаза 4: Frontend (React + Vite)

### Степ 13 — Adaptive Dashboard + Wallet Connect (Desktop + Mobile)
**Время:** ~5 часов
**Задача:**

**Setup:**
- Vite + React 18 + TypeScript + TailwindCSS
- `@solana/wallet-adapter-react` → Phantom, Solflare (+ mobile deeplink)
- `@headlessui/react` → Drawer, Dialog (мобильное меню)
- Tailwind breakpoints: sm(640) md(768) lg(1024) xl(1280)

**Адаптивный Layout:**
- `src/components/layout/AppLayout.tsx` — основной layout
  - Desktop (lg+): sidebar навигация + контент
  - Tablet (md): collapsible sidebar
  - Mobile (<md): bottom navigation + drawer menu
- `src/components/layout/Navbar.tsx`
  - Desktop: горизонтальное меню
  - Mobile: логотип + бургер + wallet
- `src/components/layout/BottomNav.tsx` — mobile only (md:hidden)
- `src/components/layout/MobileDrawer.tsx` — slide-in меню

**Адаптивные компоненты:**
- `PoolStats.tsx` — grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
- `ProtocolMoodBadge.tsx` — компактный на мобиле
- `AiDecisionCard.tsx` — адаптивный padding/font
- `RateChart.tsx` — ResponsiveContainer, h-[200px] sm:h-[250px] lg:h-[350px]
- `WalletButton.tsx` — иконка на мобиле, текст на десктопе

**Hooks:**
- `src/hooks/usePool.ts` → GET /api/pool/state
- `src/hooks/useAiDecisions.ts` → GET /api/decisions/
- `src/hooks/useWebSocket.ts` → WebSocket подключение
- `src/hooks/useMediaQuery.ts` → определение breakpoint (mobile/tablet/desktop)

**Touch UX:**
- Все кнопки min-h-[48px] (Apple HIG)
- Input font-size: 16px (предотвращает zoom на iOS)
- Карточки с gap-3, p-3 минимум

**Результат:** Открыл на десктопе → полный дашборд. Открыл на телефоне → single-column, bottom nav, всё читабельно и кликабельно.

**Проверка:**
```
Desktop (Chrome DevTools → responsive):
  1920px — 4 колонки stats, sidebar, полный график
  1024px — 4 колонки stats, компактный sidebar
  768px  — 2 колонки stats, бургер меню, график средний
  375px  — 1 колонка, bottom nav, компактный график, drawer

Реальный телефон:
  Открыть localhost через ngrok → проверить Phantom Mobile deeplink
```

---

### Степ 14 — Adaptive Deposit/Borrow + AI Decisions Log
**Время:** ~5 часов
**Задача:**

**Transaction UI (адаптивные формы):**
- `src/utils/anchor.ts` → подключение к контракту через IDL
- `DepositForm.tsx`:
  - Desktop: inline форма (input + button в строку)
  - Mobile: stacked (input сверху, кнопка full-width снизу)
  - Ввод суммы → подпись Phantom → TX в devnet → обновление
  - Slider для быстрого выбора суммы (25% / 50% / 75% / MAX)
- `BorrowForm.tsx`:
  - Показывает collateral ratio визуально (progress bar)
  - Desktop: два столбца (залог слева, займ справа)
  - Mobile: один столбец, всё последовательно

**Страницы:**
- `Deposit.tsx`:
  - Desktop: форма + баланс + loyalty tier (2 колонки)
  - Mobile: форма сверху, баланс под ней (1 колонка)
- `Borrow.tsx`:
  - Desktop: форма + позиция + visual collateral gauge
  - Mobile: stacked layout
- `AiDecisions.tsx`:
  - Desktop: таблица с колонками (время, ставка, залог, риск, TX)
  - Mobile: карточки (каждое решение = карточка с key info)
  - Пагинация: desktop — номера страниц, mobile — "Load more" кнопка
  - Фильтр по risk level (dropdown на мобиле, tabs на десктопе)
- `Analytics.tsx`:
  - Desktop: 2 графика в ряд + stats grid
  - Mobile: графики в столбик, компактные
  - ResponsiveContainer для всех графиков

**Результат:** Полное адаптивное приложение — работает одинаково хорошо на iPhone SE и на 27" мониторе.

**Проверка:**
```
Desktop:
  1. Подключить Phantom → видим баланс
  2. Deposit 100 aiUSDC → TX подтверждён → баланс обновился
  3. AI Decisions → таблица с историей решений

Mobile (375px в DevTools):
  1. Bottom nav работает
  2. Deposit форма → full-width input, full-width button
  3. AI Decisions → карточки вместо таблицы
  4. Графики адаптивные (не выходят за экран)
  5. Phantom wallet → deeplink работает
```

---

## Фаза 5: Полировка + Сдача

### Степ 15 — Integration Test + Demo + Docs + Submit
**Время:** ~4 часа
**Задача:**

**Integration Test (1 час):**
- Прогон полного цикла на devnet:
  1. Initialize pool
  2. Deposit aiUSDC (через UI)
  3. AI цикл → параметры обновлены (автоматически)
  4. Borrow (через UI)
  5. AI реагирует на изменение утилизации
  6. Repay (через UI)
- Тест guard rails: попытка AI нарушить лимиты → reject

**Demo Scenarios (1 час):**
- Сценарий 1: Нормальная работа (ставка 5% → AI → 6.5%)
- Сценарий 2: AI нарушает лимит → контракт отклоняет
- Сценарий 3: Волатильность → AI повышает залог
- Подготовить скрипт для имитации сценариев

**Documentation (1 час):**
- README.md:
  - Описание проекта (English + Russian)
  - Архитектура (диаграмма)
  - Setup guide (devnet)
  - Технологии
  - Скриншоты UI
  - Ссылка на демо-видео
- Код задокументирован (основные функции)

**Submit (1 час):**
- Push на GitHub (public repo)
- Запись демо-видео (2-3 минуты)
- Сдать на Google Forms
- Сдать на Colosseum (colosseum.com)
- Проверить что всё работает на devnet

**Результат:** Проект сдан. Рабочий MVP на devnet + GitHub + Colosseum.

---

## Сводная таблица

```
Степ  Фаза       Что                           Часы  Зависит от
─────────────────────────────────────────────────────────────────
  1   Контракт   Project Setup                   2    —
  2   Контракт   State + Initialize              2    1
  3   Контракт   Deposit + Withdraw              3    2
  4   Контракт   Collateral+Borrow+Interest      4    3
  5   Контракт   AI update + Guards + Emergency  4    4
  6   AI Agent   Config + Data Collector          2    1
  7   AI Agent   Quant Engine (math)              3    6
  8   AI Agent   ML Engine (sklearn)              3    7
  9   AI Agent   Gemini + Validator               2    8
 10   AI Agent   Orchestrator + TX + Workers      3    5, 9
 11   Backend    FastAPI + REST API               3    5
 12   Backend    WebSocket + Real-time            2    11
 13   Frontend   Adaptive Dashboard + Wallet       5    11
 14   Frontend   Adaptive Pages + AI Log          5    12, 13
 15   Polish     Integration + Demo + Submit      4    14
─────────────────────────────────────────────────────────────────
                                           ИТОГО: 48 часов

Параллельность:
  Степы 6-9 (AI Agent) можно делать ПАРАЛЛЕЛЬНО со степами 3-5 (контракт)
  Степ 11 (Backend) можно начать сразу после степа 5
  Это сокращает calendar time с 42 до ~30 часов
```

## Приоритеты при нехватке времени

```
ОБЯЗАТЕЛЬНО (MVP, без этого не примут):
  ✅ Степы 1-5: контракт
  ✅ Степы 6, 9, 10: AI agent (можно упростить math/ML)
  ✅ Степ 13: базовый дашборд
  ✅ Степ 15: submit

ЖЕЛАТЕЛЬНО (больше баллов):
  ⭐ Степы 7-8: полный math + ML (Innovation +++)
  ⭐ Степ 11: FastAPI (Technical Implementation +)
  ⭐ Степ 14: полный UI (UX +)

МОЖНО УПРОСТИТЬ:
  💡 Степ 12: WebSocket → заменить на polling каждые 10 сек
  💡 Степ 8: ML → оставить только risk_scorer, убрать IsolationForest
  💡 Loyalty Tiers → убрать, добавить если останется время
```
