"""Tests for ML Engine — models and signal aggregator."""

import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.anomaly_detector import AnomalyDetector
from models.trend_predictor import TrendPredictor
from models.volatility_model import VolatilityModel
from models.risk_scorer import RiskScorer
from models.utilization_predictor import UtilizationPredictor
from agent.signal_aggregator import build_report


# ==========================================
# Anomaly Detector
# ==========================================

def test_anomaly_normal_data():
    prices = [100 + np.sin(i * 0.1) for i in range(100)]
    detector = AnomalyDetector()
    result = detector.detect(prices)
    assert "is_anomaly" in result
    assert "anomaly_score" in result
    assert isinstance(result["is_anomaly"], bool)
    print(f"  Anomaly: {result['is_anomaly']}, score: {result['anomaly_score']}")


def test_anomaly_with_spike():
    prices = [100.0] * 50 + [200.0] + [100.0] * 49
    detector = AnomalyDetector(contamination=0.05)
    result = detector.detect(prices)
    assert "is_anomaly" in result
    print(f"  Spike anomaly: {result['is_anomaly']}, score: {result['anomaly_score']}")


def test_anomaly_insufficient():
    result = AnomalyDetector().detect([1, 2, 3])
    assert result["is_anomaly"] is False


def test_anomaly_with_volumes():
    prices = [100 + i * 0.1 for i in range(50)]
    volumes = [1000 + i * 10 for i in range(50)]
    result = AnomalyDetector().detect(prices, volumes)
    assert "anomaly_score" in result


# ==========================================
# Trend Predictor
# ==========================================

def test_trend_uptrend():
    prices = [100 + i * 0.5 for i in range(50)]
    predictor = TrendPredictor(lags=5)
    result = predictor.predict(prices, rsi=65, macd=2.0)
    assert result["direction"] in ["up", "down", "sideways"]
    assert "predicted_change_pct" in result
    assert "confidence" in result
    print(f"  Trend: {result['direction']}, change: {result['predicted_change_pct']}%")


def test_trend_downtrend():
    prices = [200 - i * 0.5 for i in range(50)]
    result = TrendPredictor().predict(prices, rsi=30, macd=-3.0)
    assert result["direction"] in ["up", "down", "sideways"]


def test_trend_insufficient():
    result = TrendPredictor().predict([1, 2, 3])
    assert result["direction"] == "hold"
    assert result["confidence"] == 0.0


# ==========================================
# Volatility Model
# ==========================================

def test_volatility_stable():
    prices = [100 + np.sin(i * 0.05) * 0.1 for i in range(100)]
    model = VolatilityModel()
    result = model.analyze(prices)
    assert result["regime"] in ["low", "medium", "high", "extreme"]
    assert result["volatility"] >= 0
    print(f"  Volatility: {result['volatility']}%, regime: {result['regime']}")


def test_volatility_wild():
    prices = [100 + (-1) ** i * 10 for i in range(100)]
    result = VolatilityModel().analyze(prices)
    assert result["volatility"] > 1.0
    print(f"  Wild volatility: {result['volatility']}%, regime: {result['regime']}")


def test_volatility_insufficient():
    result = VolatilityModel().analyze([1, 2])
    assert result["regime"] == "unknown"


# ==========================================
# Risk Scorer
# ==========================================

def test_risk_low():
    scorer = RiskScorer()
    result = scorer.score(
        volatility=0.5, vol_regime="low", trend_direction="up",
        utilization=0.3, is_anomaly=False,
        available_liquidity=700, total_deposits=1000,
    )
    assert 0 <= result["risk_score"] <= 100
    assert result["risk_level"] == "low"
    print(f"  Risk: {result['risk_score']}, level: {result['risk_level']}")


def test_risk_high():
    result = RiskScorer().score(
        volatility=8.0, vol_regime="extreme", trend_direction="down",
        utilization=0.95, is_anomaly=True,
        available_liquidity=50, total_deposits=1000,
    )
    assert result["risk_level"] in ["high", "critical"]
    print(f"  High risk: {result['risk_score']}, level: {result['risk_level']}")


def test_risk_components():
    result = RiskScorer().score(
        volatility=3.0, vol_regime="medium", trend_direction="sideways",
        utilization=0.5, is_anomaly=False,
        available_liquidity=500, total_deposits=1000,
    )
    assert "components" in result
    assert "volatility" in result["components"]
    assert "trend" in result["components"]


# ==========================================
# Utilization Predictor
# ==========================================

def test_util_predict_up():
    predictor = UtilizationPredictor()
    result = predictor.predict(
        total_deposits=1000, total_borrows=500,
        price_trend="up", volatility=1.0,
    )
    assert result["direction"] == "increasing"
    assert result["predicted_utilization"] > result["current_utilization"]
    print(f"  Util prediction: {result['current_utilization']} → {result['predicted_utilization']}")


def test_util_predict_down():
    result = UtilizationPredictor().predict(
        total_deposits=1000, total_borrows=500,
        price_trend="down", volatility=6.0,
    )
    assert result["direction"] == "decreasing"


def test_util_predict_zero_deposits():
    result = UtilizationPredictor().predict(
        total_deposits=0, total_borrows=0,
        price_trend="sideways", volatility=1.0,
    )
    assert result["current_utilization"] == 0.0


# ==========================================
# Signal Aggregator
# ==========================================

def test_build_report_structure():
    report = build_report(
        market_data={"sol_price": 185.0, "price_change_24h": -2.5},
        pool_state={"interest_rate_bps": 500, "utilization": 0.6},
        technical={
            "rsi": 65,
            "macd": {"macd": 1.5, "signal": 1.0, "histogram": 0.5, "trend": "bullish"},
            "bollinger": {"upper": 190, "middle": 185, "lower": 180, "position": "inside"},
            "atr": 3.5,
            "ema_crossover": "no_cross",
        },
        ml_signals={
            "risk_score": 35,
            "risk_level": "medium",
            "trend": {"direction": "up", "predicted_change_pct": 1.2},
            "volatility": {"volatility": 2.5, "regime": "medium"},
            "anomaly": {"is_anomaly": False, "anomaly_score": -0.2},
        },
        util_recommendation={"optimal_rate_bps": 550, "predicted_utilization": 0.65},
    )

    assert "rsi" in report
    assert "risk_score" in report
    assert 0 <= report["risk_score"] <= 100
    assert report["recommended_rate_direction"] in ["increase", "decrease", "hold"]
    assert "math_confidence" in report
    assert "votes" in report
    print(f"  Report: direction={report['recommended_rate_direction']}, "
          f"confidence={report['math_confidence']}%, "
          f"votes={report['votes']}")


def test_build_report_bearish():
    report = build_report(
        market_data={"sol_price": 100.0, "price_change_24h": -10.0},
        pool_state={"interest_rate_bps": 500, "utilization": 0.9},
        technical={
            "rsi": 25,
            "macd": {"trend": "bearish"},
            "bollinger": {"position": "below"},
            "atr": 8.0,
            "ema_crossover": "bearish_cross",
        },
        ml_signals={
            "risk_score": 80,
            "risk_level": "critical",
            "trend": {"direction": "down"},
            "volatility": {"volatility": 7.0, "regime": "extreme"},
            "anomaly": {"is_anomaly": True},
        },
        util_recommendation={"optimal_rate_bps": 300, "predicted_utilization": 0.85},
    )

    # With RSI<30 → increase, MACD bearish → decrease, BB below → increase,
    # trend down → decrease, util rate 300 < 500 → decrease
    # Votes: increase=2, decrease=3 → decrease wins
    assert report["recommended_rate_direction"] == "decrease"
