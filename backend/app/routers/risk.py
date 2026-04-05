"""Risk Router — liquidation queue + risk dashboard endpoints."""

import time
from fastapi import APIRouter, HTTPException

from app.services.solana_reader import SolanaReader
from app.config import Settings

router = APIRouter(prefix="/api/risk", tags=["Risk"])

settings = Settings()
reader = SolanaReader(settings)


@router.get("/dashboard")
async def get_risk_dashboard():
    """Aggregated risk dashboard — all protocol risk metrics in one place."""
    state = await reader.get_pool_state()
    if "error" in state:
        raise HTTPException(status_code=503, detail=state["error"])

    sol_price = state.get("sol_price_usd", 0) / 1_000_000 if state.get("sol_price_usd", 0) > 0 else 0
    utilization = state.get("utilization", 0)
    total_borrows = state.get("total_borrows", 0) / 1e6
    total_deposits = state.get("total_deposits", 0) / 1e6
    collateral_sol = state.get("total_collateral_sol", 0) / 1e9
    collateral_usd = collateral_sol * sol_price
    insurance = state.get("insurance_balance", 0) / 1e6
    insurance_coverage = (insurance / total_borrows * 100) if total_borrows > 0 else 100

    # Protection layers status
    layers = [
        {"name": "AI Prompt Guard", "status": "active", "detail": "System prompt constraints"},
        {"name": "Python Validator", "status": "active", "detail": "Bounds check before TX"},
        {"name": "On-chain Guards", "status": "active", "detail": f"Rate {state.get('min_interest_rate_bps',0)/100}%-{state.get('max_interest_rate_bps',0)/100}%"},
        {"name": "Emergency Freeze", "status": "ready", "detail": "AI or authority can freeze"},
        {"name": "Auto-rate", "status": "active" if state.get("auto_rate_active") else "ready", "detail": f"{state.get('danger_slots', 0)} danger slots"},
        {"name": "Insurance Fund", "status": "active", "detail": f"${insurance:.2f} ({insurance_coverage:.1f}% coverage)"},
        {"name": "Withdrawal Limit", "status": "active" if state.get("max_withdraw_per_epoch", 0) > 0 else "unlimited", "detail": "Per-epoch rate limit"},
    ]

    # Price staleness
    price_ts = state.get("price_last_updated", 0)
    price_age = int(time.time() - price_ts) if price_ts > 0 else -1
    price_stale = price_age > 300 or price_age < 0

    return {
        "market": {
            "sol_price": sol_price,
            "price_age_seconds": price_age,
            "price_stale": price_stale,
        },
        "protocol": {
            "utilization_pct": round(utilization * 100, 1),
            "total_deposits_usd": round(total_deposits, 2),
            "total_borrows_usd": round(total_borrows, 2),
            "total_collateral_sol": round(collateral_sol, 2),
            "collateral_usd": round(collateral_usd, 2),
            "insurance_balance_usd": round(insurance, 2),
            "insurance_coverage_pct": round(insurance_coverage, 1),
            "bad_debt_covered_usd": state.get("total_bad_debt_covered", 0) / 1e6,
            "is_frozen": state.get("is_frozen", False),
            "mood": {0: "Thriving", 1: "Calm", 2: "Cautious", 3: "Defensive", 4: "Emergency"}.get(state.get("current_mood", 1), "Unknown"),
        },
        "safety_net": {
            "danger_slots": state.get("danger_slots", 0),
            "auto_rate_active": state.get("auto_rate_active", False),
        },
        "protection_layers": layers,
    }


@router.get("/liquidation-queue")
async def get_liquidation_queue():
    """Positions at risk of liquidation, sorted by health factor."""
    state = await reader.get_pool_state()
    if "error" in state:
        raise HTTPException(status_code=503, detail=state["error"])

    sol_price = state.get("sol_price_usd", 0) / 1_000_000 if state.get("sol_price_usd", 0) > 0 else 0
    threshold_bps = state.get("liquidation_threshold_bps", 12000)
    keeper_reward_bps = state.get("keeper_reward_bps", 100)
    insurance = state.get("insurance_balance", 0) / 1e6

    # Get all positions from RPC (getProgramAccounts)
    positions = await reader.get_all_positions()

    at_risk = []
    for pos in positions:
        borrowed = pos.get("borrowed", 0)
        interest = pos.get("accrued_interest", 0)
        total_owed = (borrowed + interest) / 1e6
        if total_owed <= 0:
            continue

        collateral_sol = pos.get("collateral_sol", 0) / 1e9
        collateral_usd = collateral_sol * sol_price
        threshold_usd = total_owed * (threshold_bps / 10000)
        health = collateral_usd / threshold_usd if threshold_usd > 0 else 999

        if health < 1.5:  # show positions under watch
            at_risk.append({
                "address": pos.get("owner", "unknown"),
                "health_factor": round(health, 4),
                "debt_usd": round(total_owed, 2),
                "collateral_sol": round(collateral_sol, 4),
                "collateral_usd": round(collateral_usd, 2),
                "reward_estimate_usd": round(total_owed * keeper_reward_bps / 10000, 2),
                "liquidatable": health < 1.0,
            })

    at_risk.sort(key=lambda p: p["health_factor"])

    total_debt_at_risk = sum(p["debt_usd"] for p in at_risk if p["liquidatable"])

    return {
        "positions": at_risk[:20],
        "total_at_risk": len([p for p in at_risk if p["liquidatable"]]),
        "total_watching": len(at_risk),
        "total_debt_at_risk_usd": round(total_debt_at_risk, 2),
        "insurance_coverage_pct": round(insurance / total_debt_at_risk * 100, 1) if total_debt_at_risk > 0 else 100,
    }
