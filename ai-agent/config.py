from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    model_config = ConfigDict(env_file="../.env", extra="ignore")

    # Gemini AI
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Solana Devnet
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_ws_url: str = "wss://api.devnet.solana.com"
    ai_agent_keypair_path: str = "./keys/ai-agent.json"
    program_id: str = ""
    pool_authority: str = ""
    pool_address: str = ""

    # Timings
    ai_cycle_interval: int = 600  # 10 min
    price_watch_interval: int = 30
    health_check_interval: int = 60

    # API endpoints
    coingecko_url: str = "https://api.coingecko.com/api/v3"

    # Database
    database_url: str = "sqlite+aiosqlite:///decisions.db"
