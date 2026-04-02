"""Trend Predictor — LinearRegression on lagged features."""

import numpy as np
from sklearn.linear_model import LinearRegression


class TrendPredictor:
    def __init__(self, lags: int = 5):
        self.lags = lags
        self.model = LinearRegression()
        self._is_fitted = False

    def fit(self, prices: list[float], rsi: float = 50.0, macd: float = 0.0):
        """Train model on price data. Call once, then predict many times."""
        if len(prices) < self.lags + 2:
            return

        arr = np.array(prices, dtype=float)
        returns = np.diff(arr) / arr[:-1]

        X, y = [], []
        for i in range(self.lags, len(returns)):
            row = list(returns[i - self.lags : i]) + [rsi / 100.0, macd / arr[-1]]
            X.append(row)
            y.append(returns[i])

        self.model.fit(np.array(X), np.array(y))
        self._is_fitted = True

    def predict(
        self,
        prices: list[float],
        rsi: float = 50.0,
        macd: float = 0.0,
    ) -> dict:
        """Predict next price direction. Auto-fits if not yet trained.

        Returns: {"direction": str, "predicted_change_pct": float, "confidence": float}
        """
        if len(prices) < self.lags + 2:
            return {"direction": "hold", "predicted_change_pct": 0.0, "confidence": 0.0}

        arr = np.array(prices, dtype=float)
        returns = np.diff(arr) / arr[:-1]

        X, y = [], []
        for i in range(self.lags, len(returns)):
            row = list(returns[i - self.lags : i]) + [rsi / 100.0, macd / arr[-1]]
            X.append(row)
            y.append(returns[i])

        X = np.array(X)
        y = np.array(y)

        if not self._is_fitted:
            self.model.fit(X[:-1], y[:-1])
            self._is_fitted = True

        predicted = float(self.model.predict(X[-1:])[0])
        score = max(0.0, min(1.0, self.model.score(X[:-1], y[:-1])))

        if predicted > 0.005:
            direction = "up"
        elif predicted < -0.005:
            direction = "down"
        else:
            direction = "sideways"

        return {
            "direction": direction,
            "predicted_change_pct": round(predicted * 100, 4),
            "confidence": round(score * 100, 2),
        }
