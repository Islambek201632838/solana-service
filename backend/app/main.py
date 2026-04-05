"""SolanaAI Lend — FastAPI Backend"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.routers import pool, decisions, analytics, activity, system, leaderboard, simulate, risk
from app.services.decision_service import DecisionService
from app.services.solana_reader import SolanaReader
from app.ws.manager import manager
from app.ws.poller import PoolPoller

settings = Settings()
reader = SolanaReader(settings)
poller = PoolPoller(reader, interval=30.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[BACKEND] Starting up...")
    await DecisionService().ensure_table()
    task = asyncio.create_task(poller.start())
    yield
    task.cancel()
    await reader.close()
    print("[BACKEND] Shutting down...")


app = FastAPI(
    title="SolanaAI Lend API",
    description="AI-Powered Adaptive Lending Protocol on Solana",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST Routers
app.include_router(pool.router)
app.include_router(decisions.router)
app.include_router(analytics.router)
app.include_router(activity.router)
app.include_router(system.router)
app.include_router(leaderboard.router)
app.include_router(simulate.router)
app.include_router(risk.router)


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive, read client messages (ping/pong)
            await ws.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(ws)


@app.get("/api/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "solana_rpc": settings.solana_rpc_url,
        "ws_clients": len(manager.active),
    }
