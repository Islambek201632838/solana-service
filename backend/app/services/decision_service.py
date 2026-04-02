"""Decision Service — reads AI decision history from SQLite (WAL mode).

Uses explicit transactions for consistent reads and WAL + busy_timeout
for safe concurrent access (AI agent writes, backend reads).
"""

import asyncio

import aiosqlite


import os

class DecisionService:
    def __init__(self, db_path: str = os.environ.get("DECISIONS_DB_PATH", "../ai-agent/decisions.db")):
        self.db_path = db_path
        self._init_lock = asyncio.Lock()
        self._table_ready = False

    async def _connect(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(self.db_path)
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA busy_timeout=5000")
        db.row_factory = aiosqlite.Row
        return db

    async def ensure_table(self):
        async with self._init_lock:
            if self._table_ready:
                return
            db = await self._connect()
            try:
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS decisions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL DEFAULT '',
                        old_rate INTEGER NOT NULL DEFAULT 0,
                        new_rate INTEGER NOT NULL DEFAULT 0,
                        old_collateral INTEGER NOT NULL DEFAULT 0,
                        new_collateral INTEGER NOT NULL DEFAULT 0,
                        old_max_borrow INTEGER NOT NULL DEFAULT 0,
                        new_max_borrow INTEGER NOT NULL DEFAULT 0,
                        reasoning TEXT NOT NULL DEFAULT '',
                        confidence INTEGER NOT NULL DEFAULT 0,
                        risk_level TEXT NOT NULL DEFAULT 'medium',
                        risk_score REAL NOT NULL DEFAULT 0,
                        sol_price REAL NOT NULL DEFAULT 0,
                        utilization REAL NOT NULL DEFAULT 0,
                        tx_signature TEXT,
                        status TEXT NOT NULL DEFAULT 'pending'
                    )
                """)
                await db.execute(
                    "CREATE INDEX IF NOT EXISTS idx_decisions_risk ON decisions(risk_level)"
                )
                await db.execute(
                    "CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status)"
                )
                await db.execute(
                    "CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp)"
                )
                await db.commit()
                self._table_ready = True
            finally:
                await db.close()

    async def _ensure(self):
        if not self._table_ready:
            await self.ensure_table()

    async def get_decisions(self, page: int = 1, limit: int = 10, risk_level: str | None = None) -> dict:
        """Get paginated decisions. COUNT + SELECT in single transaction for consistency."""
        await self._ensure()
        offset = (page - 1) * limit

        db = await self._connect()
        try:
            where = ""
            params: list = []
            if risk_level:
                where = "WHERE risk_level = ?"
                params.append(risk_level)

            # Single transaction: count + fetch are consistent
            await db.execute("BEGIN")

            count_row = await db.execute(
                f"SELECT COUNT(*) FROM decisions {where}", params
            )
            total = (await count_row.fetchone())[0]

            cursor = await db.execute(
                f"SELECT * FROM decisions {where} ORDER BY id DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            )
            rows = await cursor.fetchall()

            await db.execute("COMMIT")

            return {
                "items": [dict(r) for r in rows],
                "total": total,
                "page": page,
                "limit": limit,
            }
        except Exception:
            await db.execute("ROLLBACK")
            raise
        finally:
            await db.close()

    async def get_decision_by_id(self, decision_id: int) -> dict | None:
        await self._ensure()
        db = await self._connect()
        try:
            cursor = await db.execute(
                "SELECT * FROM decisions WHERE id = ?", (decision_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None
        finally:
            await db.close()

    async def get_rate_history(self, limit: int = 50) -> list[dict]:
        await self._ensure()
        db = await self._connect()
        try:
            cursor = await db.execute(
                "SELECT timestamp, old_rate, new_rate, confidence "
                "FROM decisions ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in reversed(rows)]
        finally:
            await db.close()

    async def get_risk_history(self, limit: int = 50) -> list[dict]:
        await self._ensure()
        db = await self._connect()
        try:
            cursor = await db.execute(
                "SELECT timestamp, risk_score, risk_level, sol_price, utilization "
                "FROM decisions ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in reversed(rows)]
        finally:
            await db.close()
