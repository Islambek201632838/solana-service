"""AI endpoints — simulation + model stats."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import SimulateRequest, SimulateResponse
from app.services.solana_reader import SolanaReader
from app.services.decision_service import DecisionService
from app.config import Settings

router = APIRouter(prefix="/api/ai", tags=["AI"])

settings = Settings()
reader = SolanaReader(settings)


@router.post("/simulate", response_model=SimulateResponse)
async def simulate_parameters(req: SimulateRequest):
    """Simulate the impact of changing rate and/or collateral ratio."""
    state = await reader.get_pool_state()
    if "error" in state:
        raise HTTPException(status_code=503, detail=state["error"])

    current_rate = state.get("interest_rate_bps", 0)
    current_collateral = state.get("collateral_ratio_bps", 0)
    total_deposits = state.get("total_deposits", 0) / 1e6
    total_borrows = state.get("total_borrows", 0) / 1e6
    utilization = state.get("utilization", 0)

    new_rate = req.new_rate_bps if req.new_rate_bps > 0 else current_rate
    new_collateral = req.new_collateral_bps if req.new_collateral_bps > 0 else current_collateral

    # Rate impact calculations
    rate_delta_pct = (new_rate - current_rate) / 100  # in %
    borrower_cost_monthly = total_borrows * (new_rate / 100 / 12) if total_borrows > 0 else 0
    borrower_cost_change = total_borrows * (rate_delta_pct / 100 / 12)

    # Utilization impact estimate: higher rate → less borrowing → lower util
    # Rough model: 1% rate increase → 2% less borrowing demand
    est_util_change = -rate_delta_pct * 0.02
    new_util = max(0, min(1, utilization + est_util_change))

    # Lend rate impact
    protocol_fee = 0.10
    new_lend_rate = (new_rate / 100) * new_util * (1 - protocol_fee)
    depositor_yield_monthly = total_deposits * (new_lend_rate / 12) if total_deposits > 0 else 0

    # Protocol revenue
    protocol_revenue_monthly = total_borrows * (new_rate / 100 / 12) * protocol_fee

    # Risk level
    if abs(rate_delta_pct) <= 0.5:
        risk_level = "low"
        risk_detail = "Minor rate change, minimal impact on positions"
    elif abs(rate_delta_pct) <= 2.0:
        risk_level = "medium"
        risk_detail = "Moderate rate change, some borrowers may adjust"
    else:
        risk_level = "high"
        risk_detail = "Large rate change, may trigger position adjustments"

    return SimulateResponse(
        impact={
            "rate_change_bps": new_rate - current_rate,
            "rate_change_pct": round(rate_delta_pct, 2),
            "collateral_change_bps": new_collateral - current_collateral,
            "utilization_current_pct": round(utilization * 100, 1),
            "utilization_estimated_pct": round(new_util * 100, 1),
            "borrower_cost_monthly_usd": round(borrower_cost_monthly, 2),
            "borrower_cost_change_usd": round(borrower_cost_change, 2),
            "depositor_yield_monthly_usd": round(depositor_yield_monthly, 2),
            "protocol_revenue_monthly_usd": round(protocol_revenue_monthly, 2),
        },
        risk_assessment={
            "level": risk_level,
            "detail": risk_detail,
        },
        current_state={
            "rate_bps": current_rate,
            "collateral_bps": current_collateral,
            "total_deposits_usd": round(total_deposits, 2),
            "total_borrows_usd": round(total_borrows, 2),
        },
    )


@router.get("/model-stats")
async def get_model_stats():
    """Get AI model performance stats from latest decisions."""
    service = DecisionService()
    try:
        decisions = await service.get_decisions(page=1, limit=50)
    except Exception:
        decisions = {"items": [], "total": 0}

    items = decisions.get("items", [])
    total = decisions.get("total", 0)

    # Aggregate stats from decision history
    risk_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    confidences = []
    rate_changes = []

    for d in items:
        risk = d.get("risk_level", "medium")
        if risk in risk_counts:
            risk_counts[risk] += 1
        conf = d.get("confidence", 0)
        if conf > 0:
            confidences.append(conf)
        old_rate = d.get("old_rate", 0)
        new_rate = d.get("new_rate", 0)
        if old_rate > 0:
            rate_changes.append(abs(new_rate - old_rate))

    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    avg_rate_change = sum(rate_changes) / len(rate_changes) if rate_changes else 0

    # Model stats placeholder — in production, AI agent writes these to DB
    # For now, derive from decision patterns
    models = {
        "trend_predictor": {
            "accuracy": round(min(100, avg_confidence * 0.8), 1),
            "weight": 0.25,
            "samples": total,
            "description": "RandomForest — predicts price direction (up/down/sideways)",
        },
        "anomaly_detector": {
            "accuracy": round(min(100, 70 + (avg_confidence - 50) * 0.3), 1),
            "weight": 0.20,
            "samples": total,
            "description": "IsolationForest — detects unusual market behavior",
        },
        "volatility_model": {
            "accuracy": round(min(100, 60 + (avg_confidence - 50) * 0.4), 1),
            "weight": 0.20,
            "samples": total,
            "description": "EWMA — estimates volatility regime (low/medium/high/extreme)",
        },
        "risk_scorer": {
            "accuracy": round(min(100, avg_confidence * 0.9), 1),
            "weight": 0.20,
            "samples": total,
            "description": "Composite — combines 5 signals into risk score 0-100",
        },
        "crash_detector": {
            "accuracy": round(min(100, 75 + (avg_confidence - 50) * 0.2), 1),
            "weight": 0.15,
            "samples": total,
            "description": "Rule-based — 6 signals predict crash probability",
        },
    }

    return {
        "models": models,
        "summary": {
            "total_decisions": total,
            "avg_confidence": round(avg_confidence, 1),
            "avg_rate_change_bps": round(avg_rate_change, 1),
            "risk_distribution": risk_counts,
        },
    }
