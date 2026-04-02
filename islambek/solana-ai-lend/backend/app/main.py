"""SolanaAI Lend — FastAPI Backend"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.routers import pool, decisions, analytics
from app.services.decision_service import DecisionService

settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[BACKEND] Starting up...")
    await DecisionService().ensure_table()
    yield
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

# Routers
app.include_router(pool.router)
app.include_router(decisions.router)
app.include_router(analytics.router)


@app.get("/api/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "solana_rpc": settings.solana_rpc_url,
    }
