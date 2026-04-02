from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    model_config = ConfigDict(env_file="../.env", extra="ignore")

    # Solana
    solana_rpc_url: str = "https://api.devnet.solana.com"
    program_id: str = ""
    pool_authority: str = ""
    pool_address: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///decisions.db"

    # CORS
    cors_origins: str = "http://localhost:5173"

    # JWT
    jwt_secret: str = ""
