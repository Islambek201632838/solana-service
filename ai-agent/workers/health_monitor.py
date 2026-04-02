"""Health Monitor — checks pool health every minute.

Monitors: utilization, liquidity, frozen state.
Runs as a separate process.
"""

import asyncio

from config import Settings
from agent.data_collector import DataCollector


class HealthMonitor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.collector = DataCollector(settings)

    async def start(self):
        print("[HEALTH MONITOR] Started")
        while True:
            try:
                await self.check()
            except Exception as e:
                print(f"[HEALTH MONITOR] Error: {e}")
            await asyncio.sleep(self.settings.health_check_interval)

    async def check(self):
        pool_authority = self.settings.pool_authority if hasattr(self.settings, 'pool_authority') and self.settings.pool_authority else ""
        if not pool_authority:
            return

        pool = await self.collector.fetch_pool_state(pool_authority)

        if "error" in pool:
            print(f"[HEALTH] Pool read error: {pool['error']}")
            return

        utilization = pool.get("utilization", 0)
        is_frozen = pool.get("is_frozen", False)
        mood = pool.get("mood_str", "Unknown")
        liquidity = pool.get("available_liquidity", 0)

        if is_frozen:
            print(f"[HEALTH] FROZEN! Mood={mood}")
        elif utilization > 0.90:
            print(f"[HEALTH] HIGH UTIL: {utilization:.1%}, liquidity={liquidity}, mood={mood}")
        elif utilization > 0.80:
            print(f"[HEALTH] WARN UTIL: {utilization:.1%}, mood={mood}")
