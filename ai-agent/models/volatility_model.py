"""Volatility Model — EWMA volatility with regime detection."""

import numpy as np


class VolatilityModel:
    def __init__(self, lambda_param: float = 0.94):
        self.lambda_param = lambda_param

    def analyze(self, prices: list[float]) -> dict:
        """Compute EWMA volatility and classify regime.

        Returns: {"volatility": float, "regime": str, "vol_percentile": float}
        """
        if len(prices) < 5:
            return {"volatility": 0.0, "regime": "unknown", "vol_percentile": 0.0}

        arr = np.array(prices, dtype=float)
        returns = np.diff(arr) / arr[:-1]

        # EWMA variance
        var = returns[0] ** 2
        for r in returns[1:]:
            var = self.lambda_param * var + (1 - self.lambda_param) * r ** 2
        vol = float(np.sqrt(var)) * 100  # annualize-ish (as percentage)

        # Historical volatility distribution for percentile
        rolling_vols = []
        window = min(10, len(returns))
        for i in range(window, len(returns) + 1):
            rolling_vols.append(np.std(returns[i - window : i]) * 100)

        if rolling_vols:
            vol_percentile = float(np.mean(np.array(rolling_vols) <= vol) * 100)
        else:
            vol_percentile = 50.0

        # Regime classification
        if vol < 1.0:
            regime = "low"
        elif vol < 3.0:
            regime = "medium"
        elif vol < 6.0:
            regime = "high"
        else:
            regime = "extreme"

        return {
            "volatility": round(vol, 4),
            "regime": regime,
            "vol_percentile": round(vol_percentile, 2),
        }
