"""Decision Logger — stores AI decisions in SQLite for off-chain history."""

import aiosqlite
from datetime import datetime


class DecisionLogger:
    def __init__(self, db_path: str = "decisions.db"):
        self.db_path = db_path

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    old_rate INTEGER,
                    new_rate INTEGER,
                    old_collateral INTEGER,
                    new_collateral INTEGER,
                    old_max_borrow INTEGER,
                    new_max_borrow INTEGER,
                    reasoning TEXT,
                    confidence INTEGER,
                    risk_level TEXT,
                    risk_score REAL,
                    sol_price REAL,
                    utilization REAL,
                    tx_signature TEXT,
                    status TEXT DEFAULT 'pending'
                )
            """)
            await db.commit()

    async def log_decision(
        self,
        old_state: dict,
        decision: dict,
        quant_report: dict,
        tx_signature: str | None,
        status: str = "sent",
    ):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO decisions
                   (timestamp, old_rate, new_rate, old_collateral, new_collateral,
                    old_max_borrow, new_max_borrow, reasoning, confidence,
                    risk_level, risk_score, sol_price, utilization, tx_signature, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    datetime.utcnow().isoformat(),
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

    async def get_recent(self, limit: int = 20) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM decisions ORDER BY id DESC LIMIT ?", (limit,)
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
