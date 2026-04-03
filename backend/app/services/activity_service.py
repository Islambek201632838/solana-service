"""Activity Service — tracks lending/borrowing activity in SQLite."""

import asyncio
import aiosqlite
import os

DB_PATH = os.environ.get("DECISIONS_DB_PATH", "../ai-agent/decisions.db")


class ActivityService:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_done = False
        self._lock = asyncio.Lock()

    async def _connect(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(self.db_path)
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA busy_timeout=5000")
        db.row_factory = aiosqlite.Row
        return db

    async def init_db(self):
        async with self._lock:
            if self._init_done:
                return
            db = await self._connect()
            try:
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS activity (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        action TEXT NOT NULL,
                        user TEXT NOT NULL,
                        amount REAL NOT NULL DEFAULT 0,
                        token TEXT NOT NULL DEFAULT 'aiUSDC',
                        tx_signature TEXT NOT NULL DEFAULT '',
                        pool_util_after REAL NOT NULL DEFAULT 0,
                        rate_at_time REAL NOT NULL DEFAULT 0
                    )
                """)
                await db.execute("CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity(timestamp DESC)")
                await db.execute("CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user)")
                await db.commit()
                self._init_done = True
            finally:
                await db.close()

    async def log_activity(
        self, action: str, user: str, amount: float,
        token: str, tx_sig: str, util: float, rate: float
    ):
        await self.init_db()
        db = await self._connect()
        try:
            from datetime import datetime, timezone
            await db.execute(
                """INSERT INTO activity (timestamp, action, user, amount, token, tx_signature, pool_util_after, rate_at_time)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (datetime.now(timezone.utc).isoformat(), action, user, amount, token, tx_sig, util, rate)
            )
            await db.commit()
        finally:
            await db.close()

    async def get_recent(self, limit: int = 50, user: str | None = None) -> dict:
        await self.init_db()
        db = await self._connect()
        try:
            where = ""
            params: list = []
            if user:
                where = "WHERE user = ?"
                params.append(user)

            count_row = await db.execute(f"SELECT COUNT(*) FROM activity {where}", params)
            total = (await count_row.fetchone())[0]

            cursor = await db.execute(
                f"SELECT * FROM activity {where} ORDER BY id DESC LIMIT ?",
                params + [limit]
            )
            rows = await cursor.fetchall()
            return {"items": [dict(r) for r in rows], "total": total}
        finally:
            await db.close()
