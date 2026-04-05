"""Step 30: Leaderboard — top depositors, borrowers, keepers from activity data."""

from fastapi import APIRouter

from app.models.schemas import LeaderboardResponse, LeaderboardEntry
from app.services.activity_service import ActivityService

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])

service = ActivityService()


@router.get("/depositors", response_model=LeaderboardResponse)
async def top_depositors(limit: int = 10):
    """Top depositors by total deposit volume."""
    result = await service.get_recent(limit=500)
    items = result.get("items", [])
    user_totals: dict[str, float] = {}
    user_ops: dict[str, int] = {}
    for item in items:
        if item["action"] in ("deposit", "deposit_collateral"):
            user = item["user"]
            user_totals[user] = user_totals.get(user, 0) + item["amount"]
            user_ops[user] = user_ops.get(user, 0) + 1

    sorted_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:limit]
    entries = [
        LeaderboardEntry(rank=i + 1, user=u, amount=amt, operations=user_ops.get(u, 0), action_type="deposit")
        for i, (u, amt) in enumerate(sorted_users)
    ]
    return LeaderboardResponse(items=entries, total=len(user_totals))


@router.get("/borrowers", response_model=LeaderboardResponse)
async def top_borrowers(limit: int = 10):
    """Top borrowers by total borrow volume."""
    items = await service.get_recent(limit=500)
    user_totals: dict[str, float] = {}
    user_ops: dict[str, int] = {}
    for item in items:
        if item["action"] == "borrow":
            user = item["user"]
            user_totals[user] = user_totals.get(user, 0) + item["amount"]
            user_ops[user] = user_ops.get(user, 0) + 1

    sorted_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:limit]
    entries = [
        LeaderboardEntry(rank=i + 1, user=u, amount=amt, operations=user_ops.get(u, 0), action_type="borrow")
        for i, (u, amt) in enumerate(sorted_users)
    ]
    return LeaderboardResponse(items=entries, total=len(user_totals))


@router.get("/keepers", response_model=LeaderboardResponse)
async def top_keepers(limit: int = 10):
    """Top liquidators/keepers."""
    items = await service.get_recent(limit=500)
    user_totals: dict[str, float] = {}
    user_ops: dict[str, int] = {}
    for item in items:
        if item["action"] == "liquidate":
            user = item["user"]
            user_totals[user] = user_totals.get(user, 0) + item["amount"]
            user_ops[user] = user_ops.get(user, 0) + 1

    sorted_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:limit]
    entries = [
        LeaderboardEntry(rank=i + 1, user=u, amount=amt, operations=user_ops.get(u, 0), action_type="liquidate")
        for i, (u, amt) in enumerate(sorted_users)
    ]
    return LeaderboardResponse(items=entries, total=len(user_totals))
