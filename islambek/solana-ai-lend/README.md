# SolanaAI Lend

AI-Powered Adaptive Lending Protocol on Solana.

Лендинг-протокол где AI (Gemini) автономно управляет процентными ставками, залоговыми коэффициентами и лимитами — адаптируясь к рынку в реальном времени, а смарт-контракт жёстко ограничивает AI рамками безопасности.

> Всё работает на **Solana Devnet** — никаких реальных денег.

---

## Структура проекта

```
solana-ai-lend/
├── programs/solana-ai-lend/   # Anchor смарт-контракт (Rust)
├── tests/                     # Anchor тесты (TypeScript)
├── ai-agent/                  # AI агент (Python + Gemini)
├── backend/                   # REST API (FastAPI)
├── frontend/                  # Дашборд (React + Vite)
├── docker/                    # Docker Compose, nginx
└── keys/                      # Keypairs (НЕ в git)
```

---

## Требования

| Инструмент | Версия     |
|------------|------------|
| Node.js    | >= 18      |
| Yarn       | >= 1.22    |
| Rust       | >= 1.75    |
| Solana CLI | >= 2.0     |
| Anchor CLI | 0.32.1     |
| Python     | >= 3.10    |

---

## Установка

### 1. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Выбрать 1 (default)
source ~/.cargo/env
```

### 2. Solana CLI

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 3. Anchor CLI

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1
avm use 0.32.1
```

### 4. Проверка

```bash
rustc --version    # rustc 1.94+
solana --version   # solana-cli 3.x
anchor --version   # anchor-cli 0.32.1
node --version     # v18+
yarn --version     # 1.22+
```

---

## Настройка Solana

```bash
# Переключиться на devnet
solana config set --url devnet

# Создать keypair для деплоя (если ещё нет)
solana-keygen new --outfile keys/deployer.json

# Создать keypair для AI агента
solana-keygen new --outfile keys/ai-agent.json

# Получить тестовые SOL
solana airdrop 2 --keypair keys/deployer.json
solana airdrop 2 --keypair keys/deployer.json

# Проверить баланс
solana balance --keypair keys/deployer.json
```

---

## Запуск

### Сборка контракта

```bash
cd solana-ai-lend
anchor build
```

### Тесты (localnet)

```bash
anchor test
```

Anchor автоматически запускает локальный валидатор, деплоит программу и прогоняет тесты.

### Деплой на devnet

```bash
# Переключить Anchor на devnet (в Anchor.toml: cluster = "devnet")
anchor deploy
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Откроется на http://localhost:5173
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### AI Agent

```bash
cd ai-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

---

## Переменные окружения

```bash
cp .env.example .env
# Заполнить .env реальными значениями
```

Ключевые переменные:

| Переменная         | Описание                          |
|--------------------|-----------------------------------|
| `PROGRAM_ID`       | ID задеплоенной программы         |
| `GEMINI_API_KEY`   | API ключ Google Gemini            |
| `POSTGRES_PASSWORD`| Пароль PostgreSQL                 |
| `JWT_SECRET`       | Секрет для JWT токенов            |

Сгенерировать секреты:
```bash
openssl rand -hex 32      # для POSTGRES_PASSWORD
openssl rand -base64 48   # для JWT_SECRET
```

> **ВАЖНО:** Файлы `.env` и `keys/` НЕ коммитятся в git.

---

## Технологии

- **Контракт:** Rust + Anchor 0.32.1
- **AI:** Python + Google Gemini + sklearn + numpy
- **Backend:** FastAPI + WebSocket
- **Frontend:** React 18 + Vite + TailwindCSS + Solana Wallet Adapter
- **Инфра:** Docker Compose + PostgreSQL + Redis + Nginx

---

## Лицензия

MIT
