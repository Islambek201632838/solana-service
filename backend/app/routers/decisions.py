"""Decisions Router — AI decision history endpoints."""

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import AiDecisionResponse, AiDecisionListResponse
from app.services.decision_service import DecisionService

router = APIRouter(prefix="/api/decisions", tags=["AI Decisions"])

service = DecisionService()


def _row_to_response(row: dict) -> AiDecisionResponse:
    return AiDecisionResponse(
        id=row.get("id", 0),
        timestamp=row.get("timestamp", ""),
        old_rate=row.get("old_rate", 0),
        new_rate=row.get("new_rate", 0),
        old_collateral=row.get("old_collateral", 0),
        new_collateral=row.get("new_collateral", 0),
        reasoning=row.get("reasoning", ""),
        reasoning_en=row.get("reasoning_en", row.get("reasoning", "")),
        reasoning_ru=row.get("reasoning_ru", ""),
        confidence=row.get("confidence", 0),
        risk_level=row.get("risk_level", ""),
        risk_score=row.get("risk_score", 0),
        sol_price=row.get("sol_price", 0),
        utilization=row.get("utilization", 0),
        tx_signature=row.get("tx_signature"),
        status=row.get("status", "pending"),
    )


@router.get("/", response_model=AiDecisionListResponse)
async def list_decisions(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    risk_level: str | None = Query(None, pattern="^(low|medium|high|critical)$"),
):
    result = await service.get_decisions(page, limit, risk_level)

    return AiDecisionListResponse(
        items=[_row_to_response(r) for r in result["items"]],
        total=result["total"],
        page=result["page"],
        limit=result["limit"],
    )


@router.get("/{decision_id}", response_model=AiDecisionResponse)
async def get_decision(decision_id: int):
    row = await service.get_decision_by_id(decision_id)
    if not row:
        raise HTTPException(status_code=404, detail="Decision not found")
    return _row_to_response(row)
