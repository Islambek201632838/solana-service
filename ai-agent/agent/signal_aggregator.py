"""Signal Aggregator — combines all indicators into a QuantReport.

Votes across indicators to determine recommended rate direction.
"""


def build_report(
    market_data: dict,
    pool_state: dict,
    technical: dict,
    ml_signals: dict,
    util_recommendation: dict,
) -> dict:
    """Build unified QuantReport from all signal sources.

    Args:
        market_data: {"sol_price", "price_change_24h", ...}
        pool_state: {"interest_rate_bps", "utilization", ...}
        technical: {"rsi", "macd", "bollinger", "atr", "ema_crossover"}
        ml_signals: {"risk_score", "risk_level", "trend", "volatility", "anomaly"}
        util_recommendation: {"optimal_rate_bps", "zone", "predicted_utilization", ...}

    Returns: QuantReport dict
    """
    # Collect votes for rate direction
    votes = {"increase": 0, "decrease": 0, "hold": 0}

    # RSI signal
    rsi = technical.get("rsi", 50)
    if rsi > 70:
        votes["decrease"] += 1  # overbought → expect correction → lower rate
    elif rsi < 30:
        votes["increase"] += 1  # oversold → expect recovery → raise rate
    else:
        votes["hold"] += 1

    # MACD signal
    macd_trend = technical.get("macd", {}).get("trend", "neutral")
    if macd_trend == "bullish":
        votes["increase"] += 1
    elif macd_trend == "bearish":
        votes["decrease"] += 1
    else:
        votes["hold"] += 1

    # Bollinger position
    bb_pos = technical.get("bollinger", {}).get("position", "inside")
    if bb_pos == "above":
        votes["decrease"] += 1
    elif bb_pos == "below":
        votes["increase"] += 1
    else:
        votes["hold"] += 1

    # Trend prediction
    trend_dir = ml_signals.get("trend", {}).get("direction", "sideways")
    if trend_dir == "up":
        votes["increase"] += 1
    elif trend_dir == "down":
        votes["decrease"] += 1
    else:
        votes["hold"] += 1

    # Utilization curve recommendation
    current_rate = pool_state.get("interest_rate_bps", 500)
    optimal_rate = util_recommendation.get("optimal_rate_bps", current_rate)
    if optimal_rate > current_rate + 20:
        votes["increase"] += 1
    elif optimal_rate < current_rate - 20:
        votes["decrease"] += 1
    else:
        votes["hold"] += 1

    # Determine winner
    recommended = max(votes, key=votes.get)
    total_votes = sum(votes.values())
    math_confidence = (votes[recommended] / total_votes * 100) if total_votes > 0 else 0

    # Risk level from ML
    risk_score = ml_signals.get("risk_score", 50)
    risk_level = ml_signals.get("risk_level", "medium")

    return {
        "sol_price": market_data.get("sol_price", 0),
        "price_change_24h": market_data.get("price_change_24h", 0),
        "rsi": rsi,
        "macd": technical.get("macd", {}),
        "bollinger": technical.get("bollinger", {}),
        "atr": technical.get("atr", 0),
        "ema_crossover": technical.get("ema_crossover", "no_cross"),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "volatility": ml_signals.get("volatility", {}),
        "anomaly": ml_signals.get("anomaly", {}),
        "trend": ml_signals.get("trend", {}),
        "utilization": pool_state.get("utilization", 0),
        "current_rate_bps": current_rate,
        "optimal_rate_bps": optimal_rate,
        "predicted_utilization": util_recommendation.get("predicted_utilization", 0),
        "recommended_rate_direction": recommended,
        "math_confidence": round(math_confidence, 1),
        "votes": votes,
    }
