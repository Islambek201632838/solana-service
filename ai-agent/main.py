"""SolanaAI Lend — AI Agent Entry Point

Launches 3 processes:
  1. Orchestrator — main AI cycle (every 10 min)
  2. Health Monitor — pool health check (every 60s)
  3. Price Watcher — SOL price alerts (every 30s)
"""

import multiprocessing as mp

from config import Settings


def run_orchestrator(settings: Settings):
    """Process 1: Main AI agent (asyncio event loop)."""
    import asyncio
    from agent.orchestrator import Orchestrator

    orchestrator = Orchestrator(settings)
    asyncio.run(orchestrator.start())


def run_health_monitor(settings: Settings):
    """Process 2: Pool health monitoring."""
    import asyncio
    from workers.health_monitor import HealthMonitor

    monitor = HealthMonitor(settings)
    asyncio.run(monitor.start())


def run_price_watcher(settings: Settings):
    """Process 3: SOL price spike detection."""
    import asyncio
    from workers.price_watcher import PriceWatcher

    watcher = PriceWatcher(settings)
    asyncio.run(watcher.start())


if __name__ == "__main__":
    settings = Settings()

    processes = [
        mp.Process(target=run_orchestrator, args=(settings,), name="ai-orchestrator"),
        mp.Process(target=run_health_monitor, args=(settings,), name="health-monitor"),
        mp.Process(target=run_price_watcher, args=(settings,), name="price-watcher"),
    ]

    for p in processes:
        p.start()
        print(f"[STARTED] {p.name} (PID: {p.pid})")

    for p in processes:
        p.join()
