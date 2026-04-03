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
    borrow_rate_pct: float = 0.0     # what borrowers pay
    lend_rate_pct: float = 0.0       # what lenders earn
    protocol_fee_pct: float = 10.0   # protocol takes 10%
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
    reasoning_en: str = ""
    reasoning_ru: str = ""
    confidence: int = 0
    risk_level: str = ""
    risk_score: float = 0.0
    sol_price: float = 0.0
    utilization: float = 0.0
    tx_signature: str | None = None
    status: str = "pending"
    # ML metrics (step 17-18)
    rsi: float = 0.0
    macd_trend: str = ""
    bollinger_position: str = ""
    trend_direction: str = ""
    trend_confidence: float = 0.0
    trend_proba_up: float = 0.0
    trend_proba_down: float = 0.0
    volatility_regime: str = ""
    anomaly_detected: bool = False
    feature_importance: dict = {}
    sol_price_source: str = ""
    price_updated_onchain: bool = False
    # Sentiment (step 19)
    sentiment_score: float = 0.0
    sentiment_severity: str = "noise"
    sentiment_summary_en: str = ""
    sentiment_summary_ru: str = ""


class AiDecisionListResponse(BaseModel):
    items: list[AiDecisionResponse] = []
    total: int = 0
    page: int = 1
    limit: int = 10


class ActivityResponse(BaseModel):
    id: int = 0
    timestamp: str = ""
    action: str = ""           # deposit, withdraw, borrow, repay, deposit_collateral, liquidate
    user: str = ""             # pubkey
    amount: float = 0.0        # aiUSDC or SOL
    token: str = "aiUSDC"      # aiUSDC or SOL
    tx_signature: str = ""
    pool_util_after: float = 0.0
    rate_at_time: float = 0.0


class ActivityListResponse(BaseModel):
    items: list[ActivityResponse] = []
    total: int = 0


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    solana_rpc: str = ""
    pool_readable: bool = False
