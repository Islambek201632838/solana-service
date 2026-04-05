"""Crash Detector — predicts probability of >10% price drop in next 4 hours.

Uses 6 signals: price momentum, volume spike, consecutive red candles,
SMA deviation, short-term volatility, and trend acceleration.
"""

import numpy as np


class CrashDetector:
    def __init__(self, threshold_action: int = 50, threshold_freeze: int = 80):
        self.threshold_action = threshold_action  # raise rate
        self.threshold_freeze = threshold_freeze   # emergency freeze

    def predict(self, prices_1h: list[float], volumes: list[float] | None = None) -> dict:
        """Predict crash probability from hourly price and volume data.

        Args:
            prices_1h: hourly prices (at least 20 data points)
            volumes: hourly volumes (optional, same length as prices)

        Returns: {
            "crash_probability": 0-100,
            "action": "none" | "raise_rate" | "freeze",
            "signals": dict of individual signal scores
        }
        """
        if len(prices_1h) < 5:
            return {"crash_probability": 0, "action": "none", "signals": {}}

        prices = np.array(prices_1h, dtype=float)
        signals = {}
        risk = 0

        # Signal 1: Short-term price momentum (1h and 4h change)
        change_1h = (prices[-1] - prices[-2]) / prices[-2] if len(prices) >= 2 else 0
        change_4h = (prices[-1] - prices[-5]) / prices[-5] if len(prices) >= 5 else 0
        signals["change_1h"] = round(change_1h * 100, 2)
        signals["change_4h"] = round(change_4h * 100, 2)
        if change_4h < -0.05:
            risk += 30  # -5% in 4h
        elif change_4h < -0.03:
            risk += 15
        if change_1h < -0.03:
            risk += 15  # -3% in 1h

        # Signal 2: Volume spike (current vs 24h average)
        if volumes and len(volumes) >= 24:
            vol_arr = np.array(volumes[-24:], dtype=float)
            avg_vol = np.mean(vol_arr[:-1]) if len(vol_arr) > 1 else 1
            vol_spike = vol_arr[-1] / max(avg_vol, 1)
            signals["volume_spike"] = round(vol_spike, 2)
            if vol_spike > 3.0:
                risk += 20
            elif vol_spike > 2.0:
                risk += 10
        else:
            signals["volume_spike"] = 0

        # Signal 3: Consecutive red candles
        if len(prices) >= 6:
            consecutive_red = 0
            for i in range(len(prices) - 1, 0, -1):
                if prices[i] < prices[i - 1]:
                    consecutive_red += 1
                else:
                    break
            signals["consecutive_red"] = consecutive_red
            if consecutive_red >= 5:
                risk += 20
            elif consecutive_red >= 3:
                risk += 10
        else:
            signals["consecutive_red"] = 0

        # Signal 4: Below SMA20
        if len(prices) >= 20:
            sma20 = np.mean(prices[-20:])
            below_sma = prices[-1] < sma20
            deviation = (prices[-1] - sma20) / sma20
            signals["sma20_deviation"] = round(deviation * 100, 2)
            if below_sma and deviation < -0.05:
                risk += 15
            elif below_sma:
                risk += 5
        else:
            signals["sma20_deviation"] = 0

        # Signal 5: Short-term volatility (1h std of returns)
        if len(prices) >= 5:
            returns = np.diff(prices[-5:]) / prices[-5:-1]
            vol_1h = float(np.std(returns))
            signals["volatility_1h"] = round(vol_1h * 100, 4)
            if vol_1h > 0.03:
                risk += 15
            elif vol_1h > 0.02:
                risk += 5
        else:
            signals["volatility_1h"] = 0

        # Signal 6: Trend acceleration (second derivative of price)
        if len(prices) >= 10:
            changes = np.diff(prices[-10:])
            accel = changes[-1] - changes[-2] if len(changes) >= 2 else 0
            signals["trend_acceleration"] = round(accel, 4)
            if accel < -prices[-1] * 0.01:  # accelerating down
                risk += 10
        else:
            signals["trend_acceleration"] = 0

        crash_prob = min(100, max(0, risk))

        if crash_prob >= self.threshold_freeze:
            action = "freeze"
        elif crash_prob >= self.threshold_action:
            action = "raise_rate"
        else:
            action = "none"

        return {
            "crash_probability": crash_prob,
            "action": action,
            "signals": signals,
        }
