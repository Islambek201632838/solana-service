"""Pydantic response models for the API."""

from pydantic import BaseModel


class PoolStateResponse(BaseModel):
    authority: str = ""
    ai_agent: str = ""
    token_mint: str = ""
    total_deposits: int = 0
    total_borrows: int = 0
    available_liquidity: int = 0
    total_collateral_sol: int = 0
    interest_rate_bps: int = 0
    collateral_ratio_bps: int = 0
    max_borrow_limit: int = 0
    liquidation_threshold_bps: int = 0
    sol_price_usd: int = 0
    utilization: float = 0.0
    current_mood: str = "Unknown"
    is_frozen: bool = False
    total_deposits_count: int = 0
    total_borrows_count: int = 0
    total_ai_updates: int = 0
    total_liquidations: int = 0
    protocol_created_at: int = 0
    last_update: int = 0


class PoolStatsResponse(BaseModel):
    total_deposits_usd: float = 0.0
    total_borrows_usd: float = 0.0
    available_liquidity_usd: float = 0.0
    utilization_pct: float = 0.0
    interest_rate_pct: float = 0.0
    collateral_ratio_pct: float = 0.0
    total_collateral_sol: float = 0.0
    sol_price_usd: float = 0.0
    total_users: int = 0
    total_ai_updates: int = 0
    total_liquidations: int = 0
    mood: str = "Unknown"


class AiDecisionResponse(BaseModel):
    id: int = 0
    timestamp: str = ""
    old_rate: int = 0
    new_rate: int = 0
    old_collateral: int = 0
    new_collateral: int = 0
    reasoning: str = ""
    confidence: int = 0
    risk_level: str = ""
    risk_score: float = 0.0
    sol_price: float = 0.0
    utilization: float = 0.0
    tx_signature: str | None = None
    status: str = "pending"


class AiDecisionListResponse(BaseModel):
    items: list[AiDecisionResponse] = []
    total: int = 0
    page: int = 1
    limit: int = 10


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    solana_rpc: str = ""
    pool_readable: bool = False
