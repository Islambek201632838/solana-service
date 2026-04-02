"""SolanaAI Lend — FastAPI Backend"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings

settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[BACKEND] Starting up...")
    yield
    # Shutdown
    print("[BACKEND] Shutting down...")


app = FastAPI(
    title="SolanaAI Lend API",
    description="AI-Powered Adaptive Lending Protocol on Solana",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "solana_connected": True,
        "ai_agent_active": False,
    }
