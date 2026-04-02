"""Tests for AI Engine (Gemini) and Validator."""

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent.ai_engine import AiEngine
from agent.validator import validate
from config import Settings


# ==========================================
# Validator (no API calls needed)
# ==========================================

POOL_STATE = {
    "interest_rate_bps": 500,
    "collateral_ratio_bps": 15000,
    "min_interest_rate_bps": 100,
    "max_interest_rate_bps": 2000,
    "min_collateral_ratio_bps": 12000,
    "max_collateral_ratio_bps": 20000,
}


def _valid_decision(**overrides) -> dict:
    base = {
        "interest_rate_bps": 550,
        "collateral_ratio_bps": 15000,
        "max_borrow_limit": 10_000_000_000,
        "reasoning_short": "RSI=65, MACD bullish, util stable",
        "confidence": 85,
        "risk_level": "medium",
    }
    base.update(overrides)
    return base


def test_validator_valid():
    ok, reason = validate(_valid_decision(), POOL_STATE)
    assert ok is True
    assert reason == "OK"


def test_validator_missing_field():
    decision = _valid_decision()
    del decision["confidence"]
    ok, reason = validate(decision, POOL_STATE)
    assert ok is False
    assert "Missing field" in reason


def test_validator_rate_out_of_bounds():
    ok, reason = validate(_valid_decision(interest_rate_bps=2500), POOL_STATE)
    assert ok is False
    assert "out of bounds" in reason


def test_validator_rate_change_too_large():
    # 500 → 650 = 30% change
    ok, reason = validate(_valid_decision(interest_rate_bps=650), POOL_STATE)
    assert ok is False
    assert "20%" in reason


def test_validator_collateral_out_of_bounds():
    ok, reason = validate(_valid_decision(collateral_ratio_bps=25000), POOL_STATE)
    assert ok is False
    assert "out of bounds" in reason


def test_validator_collateral_change_too_large():
    # 15000 → 19000 = 26.7%
    ok, reason = validate(_valid_decision(collateral_ratio_bps=19000), POOL_STATE)
    assert ok is False
    assert "20%" in reason


def test_validator_low_confidence():
    ok, reason = validate(_valid_decision(confidence=30), POOL_STATE)
    assert ok is False
    assert "below threshold" in reason


def test_validator_critical_risk():
    ok, reason = validate(_valid_decision(risk_level="critical"), POOL_STATE)
    assert ok is False
    assert "critical" in reason


def test_validator_invalid_risk_level():
    ok, reason = validate(_valid_decision(risk_level="extreme"), POOL_STATE)
    assert ok is False
    assert "Invalid" in reason


def test_validator_zero_borrow_limit():
    ok, reason = validate(_valid_decision(max_borrow_limit=0), POOL_STATE)
    assert ok is False
    assert "max_borrow_limit" in reason


def test_validator_long_reasoning():
    ok, reason = validate(_valid_decision(reasoning_short="x" * 300), POOL_STATE)
    assert ok is False
    assert "256" in reason


# ==========================================
# AI Engine — parse response
# ==========================================

def test_parse_json_clean():
    settings = Settings(gemini_api_key="test")
    engine = AiEngine.__new__(AiEngine)
    result = engine._parse_response('{"interest_rate_bps": 520, "collateral_ratio_bps": 15000, "max_borrow_limit": 10000000000, "reasoning_short": "test", "confidence": 80, "risk_level": "low"}')
    assert result["interest_rate_bps"] == 520
    assert result["risk_level"] == "low"


def test_parse_json_with_markdown():
    engine = AiEngine.__new__(AiEngine)
    text = '```json\n{"interest_rate_bps": 480, "collateral_ratio_bps": 14500, "max_borrow_limit": 8000000000, "reasoning_short": "bearish signal", "confidence": 70, "risk_level": "medium"}\n```'
    result = engine._parse_response(text)
    assert result["interest_rate_bps"] == 480
    assert result["reasoning_short"] == "bearish signal"


def test_fallback_decision():
    engine = AiEngine.__new__(AiEngine)
    report = {"current_rate_bps": 600}
    result = engine._fallback_decision(report)
    assert result["interest_rate_bps"] == 600
    assert result["confidence"] == 0


# ==========================================
# AI Engine — live Gemini test (requires API key)
# ==========================================

SAMPLE_REPORT = {
    "sol_price": 185.0,
    "price_change_24h": -2.5,
    "rsi": 62.0,
    "macd": {"macd": 1.5, "signal": 1.0, "histogram": 0.5, "trend": "bullish"},
    "bollinger": {"upper": 190, "middle": 185, "lower": 180, "position": "inside"},
    "atr": 3.5,
    "ema_crossover": "no_cross",
    "risk_score": 35,
    "risk_level": "medium",
    "volatility": {"volatility": 2.5, "regime": "medium"},
    "anomaly": {"is_anomaly": False, "anomaly_score": -0.2},
    "trend": {"direction": "up", "predicted_change_pct": 1.2},
    "utilization": 0.6,
    "current_rate_bps": 500,
    "optimal_rate_bps": 550,
    "predicted_utilization": 0.65,
    "recommended_rate_direction": "increase",
    "math_confidence": 60.0,
    "votes": {"increase": 3, "decrease": 0, "hold": 2},
}


@pytest.mark.asyncio
async def test_gemini_interpret():
    """Live Gemini test — requires GEMINI_API_KEY in .env."""
    settings = Settings()
    if not settings.gemini_api_key:
        pytest.skip("No GEMINI_API_KEY set")

    engine = AiEngine(settings)
    decision = await engine.interpret(SAMPLE_REPORT)

    assert "interest_rate_bps" in decision
    assert 100 <= decision["interest_rate_bps"] <= 2000
    assert "reasoning_short" in decision
    assert decision["risk_level"] in ("low", "medium", "high", "critical")

    # Validate against pool state
    ok, reason = validate(decision, POOL_STATE)
    print(f"  Gemini decision: rate={decision['interest_rate_bps']}, "
          f"confidence={decision['confidence']}, risk={decision['risk_level']}")
    print(f"  Reasoning: {decision['reasoning_short']}")
    print(f"  Validator: {'PASS' if ok else 'FAIL'} — {reason}")
