"""Activity Router — lending/borrowing activity feed."""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from app.models.schemas import ActivityResponse, ActivityListResponse
from app.services.activity_service import ActivityService

router = APIRouter(prefix="/api/activity", tags=["Activity"])
service = ActivityService()


class LogActivityRequest(BaseModel):
    action: str
    user: str
    amount: float = 0
    token: str = "aiUSDC"
    tx_signature: str = ""
    pool_util_after: float = 0
    rate_at_time: float = 0


@router.get("/", response_model=ActivityListResponse)
async def list_activity(
    limit: int = Query(50, ge=1, le=200),
    user: str | None = Query(None),
):
    result = await service.get_recent(limit, user)
    return ActivityListResponse(
        items=[ActivityResponse(**r) for r in result["items"]],
        total=result["total"],
    )


@router.post("/log")
async def log_activity(req: LogActivityRequest):
    await service.log_activity(
        req.action, req.user, req.amount, req.token,
        req.tx_signature, req.pool_util_after, req.rate_at_time
    )
    return {"status": "ok"}
