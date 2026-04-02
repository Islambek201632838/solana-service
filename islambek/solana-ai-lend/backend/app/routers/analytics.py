"""Analytics Router — rate and risk history for charts."""

from fastapi import APIRouter, Query

from app.services.decision_service import DecisionService

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

service = DecisionService()


@router.get("/rate-history")
async def get_rate_history(limit: int = Query(50, ge=1, le=200)):
    return await service.get_rate_history(limit)


@router.get("/risk-history")
async def get_risk_history(limit: int = Query(50, ge=1, le=200)):
    return await service.get_risk_history(limit)
