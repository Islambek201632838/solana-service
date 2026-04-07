"""Pool Router — pool state and stats endpoints."""

import time as _time
from fastapi import APIRouter, HTTPException

from app.models.schemas import PoolStateResponse, PoolStatsResponse
from app.services.solana_reader import SolanaReader
from app.services.activity_service import ActivityService
from app.config import Settings

router = APIRouter(prefix="/api/pool", tags=["Pool"])

settings = Settings()
reader = SolanaReader(settings)
_activity = ActivityService()


@router.get("/state", response_model=PoolStateResponse)
async def get_pool_state():
    state = await reader.get_pool_state()
    if "error" in state:
        raise HTTPException(status_code=503, detail=state["error"])

    return PoolStateResponse(
        authority=state.get("authority", ""),
        ai_agent=state.get("ai_agent", ""),
        token_mint=state.get("token_mint", ""),
        total_deposits=state.get("total_deposits", 0),
        total_borrows=state.get("total_borrows", 0),
        available_liquidity=state.get("available_liquidity", 0),
        total_collateral_sol=state.get("total_collateral_sol", 0),
        interest_rate_bps=state.get("interest_rate_bps", 0),
        collateral_ratio_bps=state.get("collateral_ratio_bps", 0),
        max_borrow_limit=state.get("max_borrow_limit", 0),
        liquidation_threshold_bps=state.get("liquidation_threshold_bps", 0),
        sol_price_usd=state.get("sol_price_usd", 0),
        utilization=state.get("utilization", 0.0),
        current_mood=state.get("mood_str", "Unknown"),
        is_frozen=state.get("is_frozen", False),
        total_deposits_count=state.get("total_deposits_count", 0),
        total_borrows_count=state.get("total_borrows_count", 0),
        total_ai_updates=state.get("total_ai_updates", 0),
        total_liquidations=state.get("total_liquidations", 0),
        protocol_created_at=state.get("protocol_created_at", 0),
        last_update=state.get("last_update", 0),
    )


@router.get("/stats", response_model=PoolStatsResponse)
async def get_pool_stats():
    state = await reader.get_pool_state()
    if "error" in state:
        raise HTTPException(status_code=503, detail=state["error"])

    sol_price = state.get("sol_price_usd", 0) / 1_000_000 if state.get("sol_price_usd", 0) > 0 else 0

    # Calculate lend/borrow rates
    base_rate = state.get("interest_rate_bps", 0) / 100  # e.g. 1.44%
    utilization = state.get("utilization", 0)             # e.g. 0.41

    # Dynamic protocol fee based on utilization + mood
    mood = state.get("current_mood", 1)  # 0=Thriving..4=Emergency
    if utilization > 0.8 or mood >= 3:       # high util or defensive/emergency
        protocol_fee = 0.15                   # 15% — protocol takes more for risk
    elif utilization > 0.4 or mood >= 2:     # medium util or cautious
        protocol_fee = 0.10                   # 10% — standard
    else:                                     # low util, calm/thriving
        protocol_fee = 0.05                   # 5% — attract lenders

    borrow_rate = base_rate                                # borrowers pay full rate
    lend_rate = base_rate * utilization * (1 - protocol_fee)  # lenders earn less

    # Pool-level health factor: aggregate collateral_usd vs total borrows * threshold
    total_borrows = state.get("total_borrows", 0)
    threshold_bps = state.get("liquidation_threshold_bps", 12000)
    collateral_sol = state.get("total_collateral_sol", 0)
    collateral_usd = (collateral_sol * state.get("sol_price_usd", 0)) / 1e9 / 1e6 if state.get("sol_price_usd", 0) > 0 else 0
    if total_borrows > 0 and threshold_bps > 0:
        threshold_usd = (total_borrows / 1e6) * (threshold_bps / 10000)
        pool_health = collateral_usd / threshold_usd if threshold_usd > 0 else 0
    else:
        pool_health = 99.99  # no borrows = perfectly healthy

    keeper_reward_bps = state.get("keeper_reward_bps", 0)

    return PoolStatsResponse(
        total_deposits_usd=state.get("total_deposits", 0) / 1_000_000,
        total_borrows_usd=state.get("total_borrows", 0) / 1_000_000,
        available_liquidity_usd=state.get("available_liquidity", 0) / 1_000_000,
        utilization_pct=utilization * 100,
        interest_rate_pct=base_rate,
        borrow_rate_pct=round(borrow_rate, 4),
        lend_rate_pct=round(lend_rate, 4),
        protocol_fee_pct=protocol_fee * 100,
        collateral_ratio_pct=state.get("collateral_ratio_bps", 0) / 100,
        total_collateral_sol=state.get("total_collateral_sol", 0) / 1_000_000_000,
        sol_price_usd=sol_price,
        total_ai_updates=state.get("total_ai_updates", 0),
        total_liquidations=state.get("total_liquidations", 0),
        mood=state.get("mood_str", "Unknown"),
        pool_health_factor=round(pool_health, 4),
        keeper_reward_pct=keeper_reward_bps / 100,
        # Step 23: Safety Net
        danger_slots=state.get("danger_slots", 0),
        auto_rate_active=state.get("auto_rate_active", False),
        # Step 25: Price staleness
        price_last_updated=state.get("price_last_updated", 0),
        price_stale=_is_price_stale(state.get("price_last_updated", 0)),
        # Step 35: Insurance Fund (on-chain + estimated from activity)
        insurance_fund_pct=state.get("insurance_fund_bps", 0) / 100,
        insurance_balance_usd=await _estimate_insurance(state),
        total_bad_debt_covered_usd=state.get("total_bad_debt_covered", 0) / 1_000_000,
        # Supply APY breakdown
        supply_apy_daily=round(lend_rate / 365, 6),
        supply_apy_monthly=round(lend_rate / 12, 4),
    )


async def _estimate_insurance(state: dict) -> float:
    """
    Estimate insurance fund balance from activity history.

    For each borrow, we estimate the interest it generated based on:
    amount * rate_at_time * avg_hold_time / seconds_per_year
    Insurance = 10% of total estimated interest.

    Falls back to on-chain value if activity DB is unavailable.
    """
    on_chain = state.get("insurance_balance", 0) / 1_000_000
    insurance_pct = state.get("insurance_fund_bps", 0) / 10000  # e.g. 0.10

    try:
        await _activity.init_db()
        db = await _activity._connect()
        try:
            # Get all borrow/repay activity with rates
            cursor = await db.execute(
                "SELECT action, amount, rate_at_time, timestamp FROM activity ORDER BY timestamp"
            )
            rows = await cursor.fetchall()

            if not rows:
                return on_chain

            from datetime import datetime, timezone
            total_interest = 0.0
            active_borrows: list[tuple[float, float, float]] = []  # (amount, rate%, timestamp)

            for row in rows:
                action = row[0]
                amount = float(row[1])
                rate = float(row[2])  # percent, e.g. 1.5
                try:
                    ts = datetime.fromisoformat(row[3]).timestamp()
                except Exception:
                    ts = _time.time()

                if action == "borrow":
                    active_borrows.append((amount, rate, ts))
                elif action == "repay":
                    # Match against oldest borrows (FIFO)
                    remaining = amount
                    now = ts
                    while remaining > 0 and active_borrows:
                        b_amount, b_rate, b_ts = active_borrows[0]
                        matched = min(remaining, b_amount)
                        hold_seconds = max(0, now - b_ts)
                        # interest = matched * (rate/100) * hold_seconds / seconds_per_year
                        interest = matched * (b_rate / 100) * hold_seconds / 31_557_600
                        total_interest += interest
                        remaining -= matched
                        if matched >= b_amount:
                            active_borrows.pop(0)
                        else:
                            active_borrows[0] = (b_amount - matched, b_rate, b_ts)

            # Add interest still accruing on active borrows
            now = _time.time()
            for b_amount, b_rate, b_ts in active_borrows:
                hold_seconds = max(0, now - b_ts)
                interest = b_amount * (b_rate / 100) * hold_seconds / 31_557_600
                total_interest += interest

            estimated_insurance = total_interest * insurance_pct
            return max(on_chain, estimated_insurance)

        finally:
            await db.close()
    except Exception:
        return on_chain


def _is_price_stale(price_ts: int) -> bool:
    """Price is stale if > 5 minutes old or never set."""
    if price_ts == 0:
        return True
    return (_time.time() - price_ts) > 300
