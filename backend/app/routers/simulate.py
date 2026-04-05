"""Step 34: AI Dry-Run Simulation — what-if rate/collateral changes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import SimulateRequest, SimulateResponse
from app.services.solana_reader import SolanaReader
from app.config import Settings

router = APIRouter(prefix="/api/ai", tags=["AI Simulation"])

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
