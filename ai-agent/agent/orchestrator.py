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
from agent.sentiment_engine import SentimentEngine
from agent.validator import validate
from agent.tx_builder import TxBuilder
from agent.decision_logger import DecisionLogger
from models.anomaly_detector import AnomalyDetector
from models.trend_predictor import TrendPredictor
from models.volatility_model import VolatilityModel
from models.risk_scorer import RiskScorer
from models.utilization_predictor import UtilizationPredictor
from models.crash_detector import CrashDetector
from agent.preemptive_engine import PreemptiveEngine
from agent.model_reputation import ModelReputation


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
        self.sentiment = SentimentEngine(self.ai_engine.model)
        self.logger = DecisionLogger()
        self.executor = ThreadPoolExecutor(max_workers=2)

        # ML models (reusable across cycles)
        self.anomaly_detector = AnomalyDetector()
        self.trend_predictor = TrendPredictor()
        self.volatility_model = VolatilityModel()
        self.risk_scorer = RiskScorer()
        self.util_predictor = UtilizationPredictor()
        self.crash_detector = CrashDetector()
        self.preemptive = PreemptiveEngine()
        self.reputation = ModelReputation()

        # Utilization trend tracking (last N readings)
        self._util_history: list[float] = []
        self._max_util_history = 10
        self._last_sol_price: float = 0

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

        # Record outcomes from PREVIOUS cycle predictions
        if self._last_sol_price > 0:
            prev = self._last_sol_price
            direction_actual = "up" if sol_price > prev * 1.001 else "down" if sol_price < prev * 0.999 else "sideways"
            last_trend = self.reputation._last_predictions.get("trend_predictor")
            if last_trend is not None:
                self.reputation.record_binary("trend_predictor", last_trend == direction_actual)
            self.reputation.record_outcome("volatility_model", abs(sol_price - prev) / prev * 100)
        self._last_sol_price = sol_price

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
        trend = ml_signals.get("trend", {})
        print(f"[CYCLE] ML: risk={ml_signals['risk_score']:.0f}, "
              f"level={ml_signals['risk_level']}, "
              f"trend={trend.get('direction', 'hold')}")

        # ML Metrics
        if trend.get("feature_importance"):
            top_features = sorted(trend["feature_importance"].items(), key=lambda x: -x[1])[:3]
            top_str = ", ".join(f"{k}={v:.2f}" for k, v in top_features)
            print(f"[CYCLE] Features: {top_str}")
        if trend.get("accuracy_estimate", 0) > 0:
            print(f"[CYCLE] Trend accuracy: {trend['accuracy_estimate']:.1f}%, "
                  f"proba: up={trend.get('probabilities', {}).get('up', 0):.0%} "
                  f"down={trend.get('probabilities', {}).get('down', 0):.0%}")

        # 3a2. Store predictions for reputation tracking
        self.reputation.store_prediction("trend_predictor", trend.get("direction", "sideways"))
        self.reputation.store_prediction("volatility_model", ml_signals["volatility"]["volatility"])
        self.reputation.store_prediction("risk_scorer", ml_signals["risk_score"])
        if self.reputation.get_stats()["trend_predictor"]["samples"] >= 5:
            print(f"[CYCLE] Reputation: {self.reputation.summary()}")

        # 3b. Crash detection
        crash = self.crash_detector.predict(prices, volumes)
        crash_prob = crash["crash_probability"]
        if crash_prob > 0:
            print(f"[CYCLE] Crash detector: {crash_prob}% probability, action={crash['action']}")
        report_crash = crash  # save for report

        # 3c. Preemptive actions
        sentiment_score = 0  # will be updated after sentiment analysis
        preemptive_actions = self.preemptive.evaluate(
            crash_probability=crash_prob,
            sentiment_score=sentiment_score,
            volatility=ml_signals["volatility"]["volatility"],
            utilization=pool.get("utilization", 0) * 100,
            risk_score=ml_signals["risk_score"],
        )
        if preemptive_actions:
            print(f"[CYCLE] Preemptive: {self.preemptive.summarize(preemptive_actions)}")

        # 3d. Track utilization trend
        utilization = pool.get("utilization", 0)
        self._util_history.append(utilization)
        if len(self._util_history) > self._max_util_history:
            self._util_history = self._util_history[-self._max_util_history:]

        util_trend = "stable"
        if len(self._util_history) >= 3:
            recent = self._util_history[-3:]
            if recent[-1] > recent[0] + 0.05:
                util_trend = "rising"
            elif recent[-1] < recent[0] - 0.05:
                util_trend = "falling"
        if util_trend != "stable":
            print(f"[CYCLE] Utilization trend: {util_trend} ({[f'{u:.1%}' for u in self._util_history[-3:]]})")

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
        # Attach raw data for decision_logger
        report["technical"] = technical
        report["ml"] = ml_signals
        report["sol_price_source"] = "coingecko" if ctx["market"].get("sol_price", 0) > 0 else "onchain"
        report["crash"] = report_crash
        report["preemptive_actions"] = preemptive_actions
        report["util_trend"] = util_trend
        report["util_history"] = [round(u, 4) for u in self._util_history[-5:]]
        report["model_reputation"] = self.reputation.get_stats()

        # 5b. Sentiment analysis (async — runs Gemini separately)
        try:
            sentiment = await self.sentiment.analyze()
            report["sentiment"] = sentiment
            sev = sentiment.get("overall_severity", "noise")
            sent_val = sentiment.get("overall_sentiment", 0)
            summary = sentiment.get("summary_en", "")[:80]
            print(f"[CYCLE] Sentiment: {sent_val:+.2f} severity={sev} "
                  f"({sentiment.get('total_headlines', 0)} headlines, "
                  f"{sentiment.get('noise_count', 0)} noise)")
            if sentiment.get("serious_events"):
                for ev in sentiment["serious_events"][:2]:
                    print(f"[CYCLE]   SERIOUS: {ev.get('title', '')[:60]}")
            if sentiment.get("should_affect_decision"):
                print(f"[CYCLE]   → Sentiment WILL affect decision")
        except Exception as e:
            print(f"[CYCLE] Sentiment error (skipping): {e}")
            report["sentiment"] = {"overall_sentiment": 0, "overall_severity": "noise", "should_affect_decision": False}

        # 6. Gemini decision (async)
        print("[CYCLE] Asking Gemini...")
        decision = await self.ai_engine.interpret(report)

        # 6b. Dynamic LTV override based on volatility (Step 38)
        vol_regime = ml_signals.get("volatility", {}).get("regime", "medium")
        current_col = pool.get("collateral_ratio_bps", 12000)
        min_col = pool.get("min_collateral_ratio_bps", 12000)
        max_col = pool.get("max_collateral_ratio_bps", 20000)
        dynamic_col = decision["collateral_ratio_bps"]
        if vol_regime == "extreme":
            dynamic_col = min(current_col + 2000, max_col)  # +20%
        elif vol_regime == "high":
            dynamic_col = min(current_col + 1000, max_col)  # +10%
        elif vol_regime == "low" and crash_prob < 20:
            dynamic_col = max(current_col - 500, min_col)   # -5% (attract borrowers)
        if dynamic_col != decision["collateral_ratio_bps"]:
            print(f"[CYCLE] Dynamic LTV: {decision['collateral_ratio_bps']}→{dynamic_col} (vol={vol_regime})")
            decision["collateral_ratio_bps"] = dynamic_col

        print(f"[CYCLE] Gemini: rate {pool.get('interest_rate_bps', '?')}→{decision['interest_rate_bps']}, "
              f"confidence={decision['confidence']}, risk={decision['risk_level']}")
        print(f"[CYCLE] Reasoning: {decision['reasoning_short']}")

        # 7. Validate
        is_valid, reason = validate(decision, pool)
        if not is_valid:
            print(f"[CYCLE] Validation FAILED: {reason}")
            # Don't save rejected decisions — no TX to show
            pool_total = pool.get("total_ai_skips", 0)
            return

        print("[CYCLE] Validation PASSED")

        # 8. Update SOL price FIRST (always, independent of cooldown)
        pool_authority_pubkey = Pubkey.from_string(self.settings.pool_authority)
        if sol_price > 0:
            price_micro = int(sol_price * 1_000_000)
            price_tx = await self.tx_builder.send_set_sol_price(
                pool_authority_pubkey, price_micro
            )
            if price_tx:
                print(f"[CYCLE] SOL price updated: ${sol_price:.2f}")

        # 9. Send update_parameters TX
        update_number = pool.get("total_ai_updates", 0)
        tx_sig = await self.tx_builder.send_update_parameters(
            pool_authority_pubkey, decision, update_number
        )

        if tx_sig:
            print(f"[CYCLE] TX sent: {tx_sig}")
            await self.logger.log_decision(pool, decision, report, tx_sig, "confirmed")
        else:
            print("[CYCLE] TX failed (cooldown or other)")

        # 10. Auto-liquidation: scan positions and liquidate if HF < 1.0
        await self._check_liquidations(pool_authority_pubkey, pool)

        # 11. AI Emergency Freeze if risk critical OR crash imminent
        risk_score = ml_signals.get("risk_score", 0)
        is_anomaly = ml_signals.get("anomaly", {}).get("is_anomaly", False)
        should_freeze = (
            risk_score > 90
            or (is_anomaly and risk_score > 70)
            or crash_prob >= 80  # Step 36: crash detector → freeze
        )
        if should_freeze and not pool.get("is_frozen", False):
            reason = f"risk={risk_score}, anomaly={is_anomaly}, crash={crash_prob}%"
            print(f"[CYCLE] EMERGENCY: {reason}")
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

        # Volume ratio (current vs avg)
        vol_ratio = 1.0
        if volumes and len(volumes) > 2:
            avg_vol = sum(volumes) / len(volumes)
            vol_ratio = volumes[-1] / avg_vol if avg_vol > 0 else 1.0

        trend = self.trend_predictor.predict(
            prices,
            volumes=volumes,
            rsi=technical.get("rsi", 50),
            macd_hist=technical.get("macd", {}).get("histogram", 0),
            volume_ratio=vol_ratio,
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

    async def _check_liquidations(self, pool_authority: Pubkey, pool: dict):
        """Scan all positions and liquidate undercollateralized ones."""
        try:
            sol_price = pool.get("sol_price_usd", 0)
            if sol_price == 0:
                return
            threshold_bps = pool.get("liquidation_threshold_bps", 12000)
            token_mint = pool.get("token_mint", "")

            # Fetch all positions via getProgramAccounts
            client = await self.tx_builder._get_client()
            import hashlib as _hashlib
            import base58 as _b58
            disc = _hashlib.sha256(b"account:UserPosition").digest()[:8]
            program_id = self.tx_builder.program_id

            body = {
                "jsonrpc": "2.0", "id": 1,
                "method": "getProgramAccounts",
                "params": [
                    str(program_id),
                    {"encoding": "base64", "filters": [
                        {"memcmp": {"offset": 0, "bytes": _b58.b58encode(disc).decode()}}
                    ]}
                ]
            }

            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(self.tx_builder.rpc_url, json=body) as resp:
                    data = await resp.json()

            accounts = data.get("result", [])
            if not accounts:
                return

            import base64 as _b64
            import struct as _struct
            pool_pda, _ = self.tx_builder.derive_pool_pda(pool_authority)
            vault_pda, _ = Pubkey.find_program_address([b"vault", bytes(pool_pda)], program_id)
            token_program = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
            token_mint_str = pool.get("token_mint", "")
            token_mint_pubkey = Pubkey.from_string(token_mint_str) if token_mint_str else None
            # AI agent's own token account for receiving liquidation proceeds
            ata_program = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
            if token_mint_pubkey:
                ai_ata, _ = Pubkey.find_program_address(
                    [bytes(self.tx_builder.keypair.pubkey()), bytes(token_program), bytes(token_mint_pubkey)],
                    ata_program,
                )
            else:
                ai_ata = None

            liquidated = 0
            for acc in accounts:
                raw = _b64.b64decode(acc["account"]["data"][0])
                if len(raw) < 80:
                    continue
                # Parse position: skip 8 disc + 32 owner + 32 pool + 8 deposited + 8 borrowed + 8 collateral
                offset = 8
                owner_bytes = raw[offset:offset+32]
                offset += 64  # skip owner + pool
                deposited = _struct.unpack_from("<Q", raw, offset)[0]; offset += 8
                borrowed = _struct.unpack_from("<Q", raw, offset)[0]; offset += 8
                collateral_sol = _struct.unpack_from("<Q", raw, offset)[0]; offset += 8

                if borrowed == 0:
                    continue

                # Health factor
                collateral_usd = (collateral_sol * sol_price) / 1_000_000_000
                total_owed = borrowed / 1_000_000
                threshold_usd = total_owed * (threshold_bps / 10000)
                health = (collateral_usd / 1_000_000) / threshold_usd if threshold_usd > 0 else 99

                if health <= 1.0 and token_mint_pubkey and ai_ata:
                    borrower = Pubkey.from_bytes(owner_bytes)

                    max_repay = borrowed // 2
                    print(f"[CYCLE] LIQUIDATING {str(borrower)[:8]}... HF={health:.2f} debt=${total_owed:.0f}")
                    tx = await self.tx_builder.send_liquidate(
                        pool_authority, borrower, vault_pda, token_mint_pubkey, ai_ata, token_program, max_repay
                    )
                    if tx:
                        liquidated += 1
                        print(f"[CYCLE] Liquidated! TX={tx[:16]}")
                        # Log to activity service
                        try:
                            async with aiohttp.ClientSession() as s:
                                await s.post("http://backend:8000/api/activity/log", json={
                                    "action": "liquidate",
                                    "user": f"AI Agent ({str(self.tx_builder.keypair.pubkey())[:8]}...)",
                                    "amount": total_owed,
                                    "token": "aiUSDC",
                                    "tx_signature": tx,
                                    "pool_util_after": pool.get("utilization", 0) * 100,
                                    "rate_at_time": pool.get("interest_rate_bps", 0) / 100,
                                })
                        except Exception:
                            pass  # non-critical

            if liquidated > 0:
                print(f"[CYCLE] Total liquidated: {liquidated} positions")

        except Exception as e:
            print(f"[CYCLE] Liquidation scan error: {e}")
