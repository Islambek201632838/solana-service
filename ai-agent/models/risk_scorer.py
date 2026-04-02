"""Risk Scorer — weighted composite risk score."""


class RiskScorer:
    def __init__(
        self,
        w_vol: float = 0.25,
        w_trend: float = 0.20,
        w_util: float = 0.25,
        w_anomaly: float = 0.15,
        w_liquidity: float = 0.15,
    ):
        self.w_vol = w_vol
        self.w_trend = w_trend
        self.w_util = w_util
        self.w_anomaly = w_anomaly
        self.w_liquidity = w_liquidity

    def score(
        self,
        volatility: float,
        vol_regime: str,
        trend_direction: str,
        utilization: float,
        is_anomaly: bool,
        available_liquidity: float,
        total_deposits: float,
    ) -> dict:
        """Compute composite risk score 0-100.

        Returns: {"risk_score": float, "risk_level": str, "components": dict}
        """
        # Volatility risk: 0-100
        vol_risk = min(100, volatility * 10)  # 10% vol → 100 risk

        # Trend risk: down = high risk
        trend_risk = {"up": 10, "sideways": 40, "down": 80}.get(trend_direction, 50)

        # Utilization risk: >80% = high risk
        util_risk = min(100, utilization * 120)  # 83% util → 100 risk

        # Anomaly risk
        anomaly_risk = 90 if is_anomaly else 10

        # Liquidity risk: low available liquidity relative to deposits
        if total_deposits > 0:
            liq_ratio = available_liquidity / total_deposits
            liq_risk = max(0, min(100, (1 - liq_ratio) * 100))
        else:
            liq_risk = 0

        risk_score = (
            self.w_vol * vol_risk
            + self.w_trend * trend_risk
            + self.w_util * util_risk
            + self.w_anomaly * anomaly_risk
            + self.w_liquidity * liq_risk
        )

        risk_score = max(0, min(100, risk_score))

        if risk_score < 25:
            risk_level = "low"
        elif risk_score < 50:
            risk_level = "medium"
        elif risk_score < 75:
            risk_level = "high"
        else:
            risk_level = "critical"

        return {
            "risk_score": round(risk_score, 2),
            "risk_level": risk_level,
            "components": {
                "volatility": round(vol_risk, 2),
                "trend": round(trend_risk, 2),
                "utilization": round(util_risk, 2),
                "anomaly": round(anomaly_risk, 2),
                "liquidity": round(liq_risk, 2),
            },
        }
