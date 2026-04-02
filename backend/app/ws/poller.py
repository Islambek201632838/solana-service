"""Pool State Poller — background task that polls pool state and broadcasts changes."""

import asyncio
import json

from app.services.solana_reader import SolanaReader
from app.ws.manager import manager


class PoolPoller:
    def __init__(self, reader: SolanaReader, interval: float = 30.0):
        self.reader = reader
        self.interval = interval
        self._last_state: str = ""

    async def start(self):
        """Poll pool state every interval, broadcast if changed."""
        print(f"[POLLER] Started (every {self.interval}s)")
        while True:
            try:
                state = await self.reader.get_pool_state()

                if "error" not in state:
                    state_json = json.dumps(state, sort_keys=True)

                    if state_json != self._last_state:
                        self._last_state = state_json
                        await manager.broadcast({
                            "type": "pool_update",
                            "data": state,
                        })

            except Exception as e:
                print(f"[POLLER] Error: {e}")

            await asyncio.sleep(self.interval)
