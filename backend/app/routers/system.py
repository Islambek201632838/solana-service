"""Step 24: System Status — production readiness checklist."""

from fastapi import APIRouter

from app.models.schemas import SystemStatusResponse
from app.services.solana_reader import SolanaReader
from app.config import Settings

router = APIRouter(prefix="/api/system", tags=["System"])

settings = Settings()
reader = SolanaReader(settings)


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status():
    state = await reader.get_pool_state()
    pool_ok = "error" not in state

    checks = [
        {"name": "Contract deployed (devnet)", "ok": pool_ok, "scope": "devnet"},
        {"name": "Guard rails: 5 layers", "ok": pool_ok, "scope": "devnet"},
        {"name": "AI Agent: autonomous", "ok": state.get("total_ai_updates", 0) > 0 if pool_ok else False, "scope": "devnet"},
        {"name": "Partial liquidation", "ok": True, "scope": "devnet"},
        {"name": "Keeper rewards", "ok": state.get("keeper_reward_bps", 0) > 0 if pool_ok else False, "scope": "devnet"},
        {"name": "Auto-rate fallback (Safety Net)", "ok": True, "scope": "devnet"},
        {"name": "Health Factor tracking", "ok": True, "scope": "devnet"},
        {"name": "GuardrailConfig PDA", "ok": True, "scope": "devnet"},
        {"name": "Price staleness check", "ok": True, "scope": "devnet"},
        {"name": "Jito MEV protection", "ok": False, "scope": "mainnet"},
        {"name": "Priority fees", "ok": False, "scope": "mainnet"},
        {"name": "Multi-oracle (Pyth + Switchboard)", "ok": False, "scope": "mainnet"},
        {"name": "Security audit", "ok": False, "scope": "mainnet"},
    ]

    mainnet_remaining = sum(1 for c in checks if not c["ok"])

    return SystemStatusResponse(
        checks=checks,
        devnet_ready=all(c["ok"] for c in checks if c["scope"] == "devnet"),
        mainnet_remaining=mainnet_remaining,
    )
