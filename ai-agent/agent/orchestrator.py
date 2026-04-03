"""Orchestrator — main AI cycle that ties everything together.

Flow: data → quant → ML → QuantReport → Gemini → validate → TX → log
Runs every 10 minutes.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

from solders.pubkey import Pubkey

from config import Settings
from agent.data_collector import DataCollector
from agent.quant_engine import calc_rsi, calc_macd, calc_bollinger, calc_atr, calc_ema_crossover
from agent.utilization_curve import calc_optimal_rate
from agent.signal_aggregator import build_report
from agent.ai_engine import AiEngine
from agent.validator import validate
from agent.tx_builder import TxBuilder
from agent.decision_logger import DecisionLogger
from models.anomaly_detector import AnomalyDetector
from models.trend_predictor import TrendPredictor
from models.volatility_model import VolatilityModel
from models.risk_scorer import RiskScorer
from models.utilization_predictor import UtilizationPredictor


class Orchestrator:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.collector = DataCollector(settings)
        self.ai_engine = AiEngine(settings)
        self.tx_builder = TxBuilder(
            settings.solana_rpc_url,
            settings.ai_agent_keypair_path,
            settings.program_id,
        )
        self.logger = DecisionLogger()
        self.executor = ThreadPoolExecutor(max_workers=2)

        # ML models (reusable across cycles)
        self.anomaly_detector = AnomalyDetector()
        self.trend_predictor = TrendPredictor()
        self.volatility_model = VolatilityModel()
        self.risk_scorer = RiskScorer()
        self.util_predictor = UtilizationPredictor()

    async def start(self):
        """Main loop — runs AI cycle every interval."""
        await self.logger.init_db()
        print("[ORCHESTRATOR] Started")

        try:
            while True:
                try:
                    await self.run_cycle()
                except Exception as e:
                    print(f"[ORCHESTRATOR] Cycle error: {e}")

                await asyncio.sleep(self.settings.ai_cycle_interval)
        except (KeyboardInterrupt, asyncio.CancelledError):
            print("[ORCHESTRATOR] Shutting down...")
        finally:
            await self.collector.close()
            await self.tx_builder.close()
            print("[ORCHESTRATOR] Cleanup done")

    async def run_cycle(self):
        """Single AI decision cycle."""
        print("\n[CYCLE] ========================================")

        # 1. Fetch data (async)
        print("[CYCLE] Fetching data...")
        pool_address = self.settings.pool_address
        if not pool_address:
            # Derive PDA from pool_authority + program_id
            authority = Pubkey.from_string(self.settings.pool_authority)
            program = Pubkey.from_string(self.settings.program_id)
            pool_address, _ = Pubkey.find_program_address([b"lending_pool", bytes(authority)], program)
            pool_address = str(pool_address)
            print(f"[CYCLE] Derived pool PDA: {pool_address}")

        ctx = await self.collector.build_context(pool_address)
        pool = ctx.get("pool", {})

        if "error" in pool:
            print(f"[CYCLE] Pool fetch error: {pool['error']}")
            return

        prices = ctx.get("price_history", {}).get("prices", [])
        volumes = ctx.get("price_history", {}).get("volumes", [])
        sol_price = ctx["market"].get("sol_price", 0)

        # Fallback: use on-chain price if CoinGecko rate-limited
        if sol_price == 0:
            onchain_price = pool.get("sol_price_usd", 0)
            if onchain_price > 0:
                sol_price = onchain_price / 1_000_000  # stored as micro-USD
                print(f"[CYCLE] CoinGecko rate-limited, using on-chain price: ${sol_price}")
            else:
                print("[CYCLE] No SOL price data, skipping")
                return

        print(f"[CYCLE] SOL=${sol_price:.2f}, util={pool.get('utilization', 0):.2%}")

        # 2. Quant analysis (CPU-bound → thread pool)
        loop = asyncio.get_event_loop()
        technical = await loop.run_in_executor(self.executor, self._run_quant, prices)
        print(f"[CYCLE] Quant: RSI={technical['rsi']:.1f}, "
              f"MACD={technical['macd']['trend']}, "
              f"BB={technical['bollinger']['position']}")

        # 3. ML analysis (CPU-bound → thread pool)
        ml_signals = await loop.run_in_executor(
            self.executor, self._run_ml, prices, volumes, technical, pool
        )
        print(f"[CYCLE] ML: risk={ml_signals['risk_score']:.0f}, "
              f"level={ml_signals['risk_level']}, "
              f"trend={ml_signals['trend']['direction']}")

        # 4. Utilization curve
        utilization = pool.get("utilization", 0)
        util_rec = calc_optimal_rate(utilization)
        util_pred = self.util_predictor.predict(
            pool.get("total_deposits", 0),
            pool.get("total_borrows", 0),
            ml_signals["trend"]["direction"],
            ml_signals["volatility"]["volatility"],
        )
        util_rec.update(util_pred)

        # 5. Build QuantReport
        market_data = ctx["market"]
        market_data["sol_price"] = sol_price
        report = build_report(market_data, pool, technical, ml_signals, util_rec)

        # 6. Gemini decision (async)
        print("[CYCLE] Asking Gemini...")
        decision = await self.ai_engine.interpret(report)
        print(f"[CYCLE] Gemini: rate {pool.get('interest_rate_bps', '?')}→{decision['interest_rate_bps']}, "
              f"confidence={decision['confidence']}, risk={decision['risk_level']}")
        print(f"[CYCLE] Reasoning: {decision['reasoning_short']}")

        # 7. Validate
        is_valid, reason = validate(decision, pool)
        if not is_valid:
            print(f"[CYCLE] Validation FAILED: {reason}")
            await self.logger.log_decision(pool, decision, report, None, "rejected")
            pool_total = pool.get("total_ai_skips", 0)
            return

        print("[CYCLE] Validation PASSED")

        # 8. Send TX
        pool_authority_pubkey = Pubkey.from_string(self.settings.pool_authority)
        update_number = pool.get("total_ai_updates", 0)
        tx_sig = await self.tx_builder.send_update_parameters(
            pool_authority_pubkey, decision, update_number
        )

        if tx_sig:
            print(f"[CYCLE] TX sent: {tx_sig}")
            await self.logger.log_decision(pool, decision, report, tx_sig, "confirmed")
        else:
            print("[CYCLE] TX failed")
            await self.logger.log_decision(pool, decision, report, None, "tx_failed")

        # ==========================================
        # 9. AI Active Actions
        # ==========================================

        # 9a. Update SOL price on-chain
        if sol_price > 0:
            price_micro = int(sol_price * 1_000_000)  # store as micro-USD
            price_tx = await self.tx_builder.send_set_sol_price(
                pool_authority_pubkey, price_micro
            )
            if price_tx:
                print(f"[CYCLE] SOL price updated on-chain: ${sol_price:.2f}")

        # 9b. AI Emergency Freeze if risk critical
        risk_score = ml_signals.get("risk_score", 0)
        is_anomaly = ml_signals.get("anomaly", {}).get("is_anomaly", False)
        if risk_score > 90 or (is_anomaly and risk_score > 70):
            print(f"[CYCLE] EMERGENCY: risk={risk_score}, anomaly={is_anomaly}")
            freeze_tx = await self.tx_builder.send_ai_emergency_freeze(pool_authority_pubkey)
            if freeze_tx:
                print(f"[CYCLE] PROTOCOL FROZEN BY AI: {freeze_tx}")

        print("[CYCLE] ========================================\n")

    def _run_quant(self, prices: list[float]) -> dict:
        """Run all quant indicators (synchronous, for thread pool)."""
        if not prices or len(prices) < 2:
            return {
                "rsi": 50.0,
                "macd": {"macd": 0, "signal": 0, "histogram": 0, "trend": "neutral"},
                "bollinger": {"upper": 0, "middle": 0, "lower": 0, "width": 0, "position": "neutral"},
                "atr": 0,
                "ema_crossover": "no_cross",
            }

        # For ATR we need highs/lows — approximate from prices
        highs = [max(prices[max(0, i - 1):i + 1]) for i in range(len(prices))]
        lows = [min(prices[max(0, i - 1):i + 1]) for i in range(len(prices))]

        return {
            "rsi": calc_rsi(prices),
            "macd": calc_macd(prices),
            "bollinger": calc_bollinger(prices),
            "atr": calc_atr(highs, lows, prices),
            "ema_crossover": calc_ema_crossover(prices),
        }

    def _run_ml(self, prices: list, volumes: list, technical: dict, pool: dict) -> dict:
        """Run all ML models (synchronous, for thread pool)."""
        anomaly = self.anomaly_detector.detect(prices, volumes)
        trend = self.trend_predictor.predict(
            prices,
            rsi=technical.get("rsi", 50),
            macd=technical.get("macd", {}).get("macd", 0),
        )
        volatility = self.volatility_model.analyze(prices)
        risk = self.risk_scorer.score(
            volatility=volatility["volatility"],
            vol_regime=volatility["regime"],
            trend_direction=trend["direction"],
            utilization=pool.get("utilization", 0),
            is_anomaly=anomaly["is_anomaly"],
            available_liquidity=pool.get("available_liquidity", 0),
            total_deposits=pool.get("total_deposits", 1),
        )

        return {
            "anomaly": anomaly,
            "trend": trend,
            "volatility": volatility,
            "risk_score": risk["risk_score"],
            "risk_level": risk["risk_level"],
            "risk_components": risk["components"],
        }
