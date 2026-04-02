"""Utilization Predictor — forecast future utilization from trends."""

import numpy as np
from sklearn.linear_model import LinearRegression


class UtilizationPredictor:
    def __init__(self):
        self.model = LinearRegression()

    def predict(
        self,
        total_deposits: float,
        total_borrows: float,
        price_trend: str,
        volatility: float,
    ) -> dict:
        """Predict utilization direction based on current state and market.

        Returns: {"predicted_utilization": float, "direction": str}
        """
        current_util = total_borrows / total_deposits if total_deposits > 0 else 0.0

        # Heuristic adjustment based on market conditions
        adjustment = 0.0

        # Rising prices → more collateral value → more borrowing → higher util
        if price_trend == "up":
            adjustment += 0.03
        elif price_trend == "down":
            adjustment -= 0.05  # users repay/deleverage

        # High volatility → users deleverage
        if volatility > 5.0:
            adjustment -= 0.04
        elif volatility > 3.0:
            adjustment -= 0.02

        predicted = max(0.0, min(1.0, current_util + adjustment))

        if predicted > current_util + 0.01:
            direction = "increasing"
        elif predicted < current_util - 0.01:
            direction = "decreasing"
        else:
            direction = "stable"

        return {
            "current_utilization": round(current_util, 4),
            "predicted_utilization": round(predicted, 4),
            "direction": direction,
        }
