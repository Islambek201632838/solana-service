"""WebSocket Connection Manager — broadcast pool updates to all clients."""

import asyncio
import json

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.active.append(ws)
        print(f"[WS] Client connected ({len(self.active)} total)")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self.active:
                self.active.remove(ws)
        print(f"[WS] Client disconnected ({len(self.active)} total)")

    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        data = json.dumps(message)
        async with self._lock:
            stale = []
            for ws in self.active:
                try:
                    await ws.send_text(data)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                self.active.remove(ws)


manager = ConnectionManager()
