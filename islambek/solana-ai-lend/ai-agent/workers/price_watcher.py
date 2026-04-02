"""Price Watcher — monitors SOL price for sudden spikes/drops.

Alerts if price changes > 5% within 5 minutes.
Runs as a separate process.
"""

import asyncio
from collections import deque
from datetime import datetime

from config import Settings
from agent.data_collector import DataCollector


class PriceWatcher:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.collector = DataCollector(settings)
        self.price_history: deque = deque(maxlen=10)  # last 10 checks (5 min at 30s interval)
        self.alert_threshold = 0.05  # 5%

    async def start(self):
        print("[PRICE WATCHER] Started")
        while True:
            try:
                await self.check()
            except Exception as e:
                print(f"[PRICE WATCHER] Error: {e}")
            await asyncio.sleep(self.settings.price_watch_interval)

    async def check(self):
        data = await self.collector.fetch_sol_price()
        price = data.get("sol_price", 0)

        if price <= 0:
            return

        self.price_history.append(price)

        if len(self.price_history) < 2:
            return

        oldest = self.price_history[0]
        change = (price - oldest) / oldest

        if abs(change) >= self.alert_threshold:
            direction = "SPIKE" if change > 0 else "DROP"
            print(f"[PRICE ALERT] {direction}: ${oldest:.2f} → ${price:.2f} "
                  f"({change:+.1%}) in {len(self.price_history) * self.settings.price_watch_interval}s")
