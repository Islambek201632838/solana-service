"""Decision Logger — stores AI decisions in SQLite (WAL mode) for off-chain history."""

import aiosqlite
from datetime import datetime, timezone


class DecisionLogger:
    def __init__(self, db_path: str = "decisions.db"):
        self.db_path = db_path

    async def _connect(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(self.db_path)
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA busy_timeout=5000")
        return db

    async def init_db(self):
        db = await self._connect()
        try:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
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
        finally:
            await db.close()

    async def log_decision(
        self,
        old_state: dict,
        decision: dict,
        quant_report: dict,
        tx_signature: str | None,
        status: str = "sent",
    ):
        db = await self._connect()
        try:
            await db.execute("BEGIN IMMEDIATE")
            await db.execute(
                """INSERT INTO decisions
                   (timestamp, old_rate, new_rate, old_collateral, new_collateral,
                    old_max_borrow, new_max_borrow, reasoning, confidence,
                    risk_level, risk_score, sol_price, utilization, tx_signature, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    datetime.now(timezone.utc).isoformat(),
                    old_state.get("interest_rate_bps", 0),
                    decision.get("interest_rate_bps", 0),
                    old_state.get("collateral_ratio_bps", 0),
                    decision.get("collateral_ratio_bps", 0),
                    old_state.get("max_borrow_limit", 0),
                    decision.get("max_borrow_limit", 0),
                    decision.get("reasoning_short", ""),
                    decision.get("confidence", 0),
                    decision.get("risk_level", "medium"),
                    quant_report.get("risk_score", 0),
                    quant_report.get("sol_price", 0),
                    quant_report.get("utilization", 0),
                    tx_signature,
                    status,
                ),
            )
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        finally:
            await db.close()

    async def get_recent(self, limit: int = 20) -> list[dict]:
        db = await self._connect()
        try:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM decisions ORDER BY id DESC LIMIT ?", (limit,)
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            await db.close()
