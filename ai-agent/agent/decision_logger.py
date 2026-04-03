"""Decision Logger — stores AI decisions in SQLite (WAL mode) for off-chain history."""

import json
import aiosqlite
from datetime import datetime, timezone

import os

class DecisionLogger:
    def __init__(self, db_path: str = os.environ.get("DECISIONS_DB_PATH", "decisions.db")):
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
                    reasoning_en TEXT NOT NULL DEFAULT '',
                    reasoning_ru TEXT NOT NULL DEFAULT '',
                    confidence INTEGER NOT NULL DEFAULT 0,
                    risk_level TEXT NOT NULL DEFAULT 'medium',
                    risk_score REAL NOT NULL DEFAULT 0,
                    sol_price REAL NOT NULL DEFAULT 0,
                    utilization REAL NOT NULL DEFAULT 0,
                    tx_signature TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    rsi REAL NOT NULL DEFAULT 0,
                    macd_trend TEXT NOT NULL DEFAULT '',
                    bollinger_position TEXT NOT NULL DEFAULT '',
                    trend_direction TEXT NOT NULL DEFAULT '',
                    trend_confidence REAL NOT NULL DEFAULT 0,
                    trend_proba_up REAL NOT NULL DEFAULT 0,
                    trend_proba_down REAL NOT NULL DEFAULT 0,
                    volatility_regime TEXT NOT NULL DEFAULT '',
                    anomaly_detected INTEGER NOT NULL DEFAULT 0,
                    feature_importance TEXT NOT NULL DEFAULT '{}',
                    sol_price_source TEXT NOT NULL DEFAULT '',
                    price_updated_onchain INTEGER NOT NULL DEFAULT 0,
                    sentiment_score REAL NOT NULL DEFAULT 0,
                    sentiment_severity TEXT NOT NULL DEFAULT 'noise',
                    sentiment_summary_en TEXT NOT NULL DEFAULT '',
                    sentiment_summary_ru TEXT NOT NULL DEFAULT ''
                )
            """)
            # Add columns if they don't exist (migration for existing DBs)
            for col, dtype in [
                ("rsi", "REAL NOT NULL DEFAULT 0"),
                ("macd_trend", "TEXT NOT NULL DEFAULT ''"),
                ("bollinger_position", "TEXT NOT NULL DEFAULT ''"),
                ("trend_direction", "TEXT NOT NULL DEFAULT ''"),
                ("trend_confidence", "REAL NOT NULL DEFAULT 0"),
                ("trend_proba_up", "REAL NOT NULL DEFAULT 0"),
                ("trend_proba_down", "REAL NOT NULL DEFAULT 0"),
                ("volatility_regime", "TEXT NOT NULL DEFAULT ''"),
                ("anomaly_detected", "INTEGER NOT NULL DEFAULT 0"),
                ("feature_importance", "TEXT NOT NULL DEFAULT '{}'"),
                ("sol_price_source", "TEXT NOT NULL DEFAULT ''"),
                ("price_updated_onchain", "INTEGER NOT NULL DEFAULT 0"),
                ("sentiment_score", "REAL NOT NULL DEFAULT 0"),
                ("sentiment_severity", "TEXT NOT NULL DEFAULT 'noise'"),
                ("sentiment_summary_en", "TEXT NOT NULL DEFAULT ''"),
                ("sentiment_summary_ru", "TEXT NOT NULL DEFAULT ''"),
            ]:
                try:
                    await db.execute(f"ALTER TABLE decisions ADD COLUMN {col} {dtype}")
                except Exception:
                    pass  # column already exists

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
        # Extract ML metrics from quant_report
        technical = quant_report.get("technical", {})
        ml = quant_report.get("ml", {})
        trend = ml.get("trend", {})
        anomaly = ml.get("anomaly", {})
        volatility = ml.get("volatility", {})
        probabilities = trend.get("probabilities", {})
        feature_imp = trend.get("feature_importance", {})

        db = await self._connect()
        try:
            await db.execute("BEGIN IMMEDIATE")
            await db.execute(
                """INSERT INTO decisions
                   (timestamp, old_rate, new_rate, old_collateral, new_collateral,
                    old_max_borrow, new_max_borrow, reasoning, reasoning_en, reasoning_ru,
                    confidence, risk_level, risk_score, sol_price, utilization,
                    tx_signature, status,
                    rsi, macd_trend, bollinger_position,
                    trend_direction, trend_confidence, trend_proba_up, trend_proba_down,
                    volatility_regime, anomaly_detected, feature_importance,
                    sol_price_source, price_updated_onchain,
                    sentiment_score, sentiment_severity, sentiment_summary_en, sentiment_summary_ru)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                           ?, ?, ?, ?)""",
                (
                    datetime.now(timezone.utc).isoformat(),
                    old_state.get("interest_rate_bps", 0),
                    decision.get("interest_rate_bps", 0),
                    old_state.get("collateral_ratio_bps", 0),
                    decision.get("collateral_ratio_bps", 0),
                    old_state.get("max_borrow_limit", 0),
                    decision.get("max_borrow_limit", 0),
                    decision.get("reasoning_short", ""),
                    decision.get("reasoning_en", decision.get("reasoning_short", "")),
                    decision.get("reasoning_ru", ""),
                    decision.get("confidence", 0),
                    decision.get("risk_level", "medium"),
                    quant_report.get("risk_score", 0),
                    quant_report.get("sol_price", 0),
                    quant_report.get("utilization", 0),
                    tx_signature,
                    status,
                    # ML metrics
                    technical.get("rsi", 0),
                    technical.get("macd", {}).get("trend", ""),
                    technical.get("bollinger", {}).get("position", ""),
                    trend.get("direction", ""),
                    trend.get("confidence", 0),
                    probabilities.get("up", 0),
                    probabilities.get("down", 0),
                    volatility.get("regime", ""),
                    1 if anomaly.get("is_anomaly", False) else 0,
                    json.dumps(feature_imp),
                    quant_report.get("sol_price_source", ""),
                    1 if quant_report.get("price_updated_onchain", False) else 0,
                    # Sentiment
                    quant_report.get("sentiment", {}).get("overall_sentiment", 0),
                    quant_report.get("sentiment", {}).get("overall_severity", "noise"),
                    quant_report.get("sentiment", {}).get("summary_en", ""),
                    quant_report.get("sentiment", {}).get("summary_ru", ""),
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
