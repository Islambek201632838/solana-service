"""Health Monitor — checks pool health every minute.

Monitors: utilization, liquidity, frozen state.
Runs as a separate process.
"""

import asyncio

import numpy as np
from solders.pubkey import Pubkey

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
        if not self.settings.pool_authority or not self.settings.program_id:
            return

        # Derive pool PDA from authority + program_id
        authority = Pubkey.from_string(self.settings.pool_authority)
        program = Pubkey.from_string(self.settings.program_id)
        pool_pda, _ = Pubkey.find_program_address([b"lending_pool", bytes(authority)], program)

        pool = await self.collector.fetch_pool_state(str(pool_pda))

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

        # Liquidation prediction: estimate how likely positions get liquidated
        sol_price = pool.get("sol_price_usd", 0) / 1_000_000 if pool.get("sol_price_usd", 0) > 0 else 0
        threshold_bps = pool.get("liquidation_threshold_bps", 12000)
        collateral_sol = pool.get("total_collateral_sol", 0) / 1e9
        total_borrows = pool.get("total_borrows", 0) / 1e6

        if sol_price > 0 and total_borrows > 0 and collateral_sol > 0:
            probs = self._predict_liquidation(sol_price, collateral_sol, total_borrows, threshold_bps)
            if probs["4h"] > 30:
                print(f"[HEALTH] LIQUIDATION RISK: 1h={probs['1h']}% 4h={probs['4h']}% 24h={probs['24h']}%")

    @staticmethod
    def _predict_liquidation(
        sol_price: float, collateral_sol: float, total_borrows: float,
        threshold_bps: int, vol: float = 0.03, simulations: int = 500,
    ) -> dict[str, int]:
        """Monte Carlo: simulate price paths → estimate liquidation probability."""
        collateral_usd = collateral_sol * sol_price
        threshold_usd = total_borrows * (threshold_bps / 10000)
        health = collateral_usd / threshold_usd if threshold_usd > 0 else 99

        results = {"1h": 0, "4h": 0, "24h": 0}
        for horizon_key, hours in [("1h", 1), ("4h", 4), ("24h", 24)]:
            count = 0
            for _ in range(simulations):
                # Random walk: price change ~ N(0, vol * sqrt(hours))
                change = np.random.normal(0, vol * np.sqrt(hours))
                new_health = health * (1 + change)
                if new_health < 1.0:
                    count += 1
            results[horizon_key] = int(count / simulations * 100)
        return results
