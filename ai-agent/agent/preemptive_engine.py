"""Preemptive Engine — combines signals from all models into pre-emptive actions.

Instead of reacting AFTER a problem (liquidation when health < 1.0),
the engine acts BEFORE the problem (raise collateral when crash likely).
"""


class PreemptiveEngine:
    def evaluate(
        self,
        crash_probability: float,
        sentiment_score: float,
        volatility: float,
        utilization: float,
        risk_score: float,
        positions_at_risk: int = 0,
    ) -> list[dict]:
        """Evaluate all signals and return list of recommended preemptive actions.

        Returns list of: {"type": str, "param": str, "amount_bps": int,
                          "reason": str, "urgency": "low"|"medium"|"high"}
        """
        actions = []

        # 1. Crash probability high → raise collateral ratio
        if crash_probability >= 60:
            actions.append({
                "type": "raise_collateral",
                "param": "collateral_ratio_bps",
                "amount_bps": 1000,  # +10%
                "reason": f"Crash probability {crash_probability:.0f}%",
                "urgency": "high",
            })
        elif crash_probability >= 40:
            actions.append({
                "type": "raise_collateral",
                "param": "collateral_ratio_bps",
                "amount_bps": 500,  # +5%
                "reason": f"Elevated crash risk {crash_probability:.0f}%",
                "urgency": "medium",
            })

        # 2. Negative sentiment → raise rate to cool borrowing
        if sentiment_score < -0.5:
            actions.append({
                "type": "raise_rate",
                "param": "interest_rate_bps",
                "amount_bps": 100,  # +1%
                "reason": f"Negative sentiment {sentiment_score:.2f}",
                "urgency": "medium",
            })

        # 3. High volatility → raise collateral
        if volatility > 5.0:
            actions.append({
                "type": "raise_collateral",
                "param": "collateral_ratio_bps",
                "amount_bps": 500,
                "reason": f"High volatility {volatility:.1f}%",
                "urgency": "medium",
            })

        # 4. High utilization → raise rate
        if utilization > 85:
            actions.append({
                "type": "raise_rate",
                "param": "interest_rate_bps",
                "amount_bps": 50,  # +0.5%
                "reason": f"Utilization {utilization:.1f}% above 85%",
                "urgency": "high",
            })

        # 5. Positions at risk → warn
        if positions_at_risk >= 3:
            actions.append({
                "type": "warn",
                "param": "positions",
                "amount_bps": 0,
                "reason": f"{positions_at_risk} positions approaching liquidation",
                "urgency": "medium",
            })

        # 6. High overall risk → conservative mode
        if risk_score > 70:
            actions.append({
                "type": "raise_rate",
                "param": "interest_rate_bps",
                "amount_bps": 50,
                "reason": f"Risk score {risk_score:.0f} (>70)",
                "urgency": "high",
            })

        return actions

    def summarize(self, actions: list[dict]) -> str:
        """One-line summary for logging."""
        if not actions:
            return "No preemptive actions needed"
        parts = [f"{a['type']}({a['reason']})" for a in actions[:3]]
        return "; ".join(parts)
