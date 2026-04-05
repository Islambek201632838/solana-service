"""Credit Score Router — on-chain credit scoring per wallet."""

import time
from fastapi import APIRouter, HTTPException

from app.services.solana_reader import SolanaReader
from app.config import Settings

router = APIRouter(prefix="/api/credit-score", tags=["Credit Score"])

settings = Settings()
reader = SolanaReader(settings)

TIER_THRESHOLDS = [
    (90, "Platinum", 15, 10),  # score, name, collateral_discount_pct, rate_discount_pct
    (70, "Gold", 10, 5),
    (50, "Silver", 5, 2),
    (0, "Bronze", 0, 0),
]


@router.get("/{wallet}")
async def get_credit_score(wallet: str):
    """Calculate credit score for a wallet based on on-chain history."""
    positions = await reader.get_all_positions()

    # Find this wallet's position
    pos = None
    for p in positions:
        if p.get("owner", "") == wallet:
            pos = p
            break

    if pos is None:
        raise HTTPException(status_code=404, detail="Position not found for this wallet")

    # Factor 1: Account age (max 20 pts)
    first_deposit = pos.get("first_deposit_at", 0)
    if first_deposit > 0:
        days = (time.time() - first_deposit) / 86400
        age_score = min(20, int(days / 3 * 20))  # 3 days = max
    else:
        age_score = 0

    # Factor 2: Total operations (max 20 pts)
    ops = pos.get("total_operations", 0)
    ops_score = min(20, ops)  # 1 point per operation, max 20

    # Factor 3: Has active borrows and repays (borrower reliability) (max 20 pts)
    deposited = pos.get("deposited", 0) / 1e6
    borrowed = pos.get("borrowed", 0) / 1e6
    if deposited > 0 and borrowed == 0:
        repay_score = 20  # depositor with no debt = reliable
    elif deposited > 0 and borrowed > 0 and borrowed < deposited * 0.5:
        repay_score = 15  # conservative borrower
    elif borrowed > 0:
        repay_score = 10  # active borrower
    else:
        repay_score = 5

    # Factor 4: Never liquidated (max 20 pts)
    # We can't easily check this from position alone, assume no liquidation for now
    # In production: check liquidation events for this wallet
    no_liq_score = 20  # default: assume no liquidation

    # Factor 5: Position size — skin in the game (max 20 pts)
    collateral_sol = pos.get("collateral_sol", 0) / 1e9
    size_score = min(20, int(collateral_sol * 10))  # 2 SOL = max

    total = age_score + ops_score + repay_score + no_liq_score + size_score
    total = min(100, max(0, total))

    # Determine tier
    tier_name = "Bronze"
    col_discount = 0
    rate_discount = 0
    for threshold, name, col_d, rate_d in TIER_THRESHOLDS:
        if total >= threshold:
            tier_name = name
            col_discount = col_d
            rate_discount = rate_d
            break

    # Loyalty tier from on-chain (0=Bronze, 1=Silver, 2=Gold, 3=Platinum)
    loyalty_tier_idx = pos.get("loyalty_tier", 0)
    loyalty_names = ["Bronze", "Silver", "Gold", "Platinum"]
    on_chain_tier = loyalty_names[loyalty_tier_idx] if loyalty_tier_idx < 4 else "Bronze"

    return {
        "wallet": wallet,
        "score": total,
        "tier": tier_name,
        "on_chain_tier": on_chain_tier,
        "collateral_discount_pct": col_discount,
        "rate_discount_pct": rate_discount,
        "factors": {
            "account_age": {"score": age_score, "max": 20, "detail": f"{days:.0f} days" if first_deposit > 0 else "new"},
            "operations": {"score": ops_score, "max": 20, "detail": f"{ops} ops"},
            "repay_reliability": {"score": repay_score, "max": 20},
            "no_liquidations": {"score": no_liq_score, "max": 20},
            "position_size": {"score": size_score, "max": 20, "detail": f"{collateral_sol:.2f} SOL"},
        },
        "next_tier": None if tier_name == "Platinum" else {
            "name": TIER_THRESHOLDS[[t[1] for t in TIER_THRESHOLDS].index(tier_name) - 1][1] if tier_name != "Platinum" else None,
            "points_needed": TIER_THRESHOLDS[[t[1] for t in TIER_THRESHOLDS].index(tier_name) - 1][0] - total if tier_name != "Platinum" else 0,
        },
    }
