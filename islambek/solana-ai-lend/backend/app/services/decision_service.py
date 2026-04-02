"""Decision Service — reads AI decision history from SQLite."""

import aiosqlite


class DecisionService:
    def __init__(self, db_path: str = "../ai-agent/decisions.db"):
        self.db_path = db_path
        self._table_ready = False

    async def ensure_table(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL DEFAULT '',
                    old_rate INTEGER DEFAULT 0,
                    new_rate INTEGER DEFAULT 0,
                    old_collateral INTEGER DEFAULT 0,
                    new_collateral INTEGER DEFAULT 0,
                    old_max_borrow INTEGER DEFAULT 0,
                    new_max_borrow INTEGER DEFAULT 0,
                    reasoning TEXT DEFAULT '',
                    confidence INTEGER DEFAULT 0,
                    risk_level TEXT DEFAULT 'medium',
                    risk_score REAL DEFAULT 0,
                    sol_price REAL DEFAULT 0,
                    utilization REAL DEFAULT 0,
                    tx_signature TEXT,
                    status TEXT DEFAULT 'pending'
                )
            """)
            await db.commit()
        self._table_ready = True

    async def _ensure(self):
        if not self._table_ready:
            await self.ensure_table()

    async def get_decisions(self, page: int = 1, limit: int = 10, risk_level: str | None = None) -> dict:
        """Get paginated decisions with optional risk_level filter."""
        await self._ensure()
        offset = (page - 1) * limit

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            where = ""
            params: list = []
            if risk_level:
                where = "WHERE risk_level = ?"
                params.append(risk_level)

            # Count total
            count_row = await db.execute(
                f"SELECT COUNT(*) as cnt FROM decisions {where}", params
            )
            total = (await count_row.fetchone())[0]

            # Fetch page
            cursor = await db.execute(
                f"SELECT * FROM decisions {where} ORDER BY id DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            )
            rows = await cursor.fetchall()

            return {
                "items": [dict(r) for r in rows],
                "total": total,
                "page": page,
                "limit": limit,
            }

    async def get_decision_by_id(self, decision_id: int) -> dict | None:
        await self._ensure()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM decisions WHERE id = ?", (decision_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_rate_history(self, limit: int = 50) -> list[dict]:
        """Rate changes over time for analytics chart."""
        await self._ensure()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT timestamp, old_rate, new_rate, confidence FROM decisions ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in reversed(rows)]

    async def get_risk_history(self, limit: int = 50) -> list[dict]:
        """Risk score over time for analytics chart."""
        await self._ensure()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT timestamp, risk_score, risk_level, sol_price, utilization FROM decisions ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in reversed(rows)]
