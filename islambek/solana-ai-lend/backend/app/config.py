from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Solana
    solana_rpc_url: str = "https://api.devnet.solana.com"
    program_id: str = ""
    pool_authority: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///decisions.db"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # JWT — no default, MUST be set in .env
    jwt_secret: str

    class Config:
        env_file = ".env"
