"""Tests for PreemptiveEngine."""

import pytest
from agent.preemptive_engine import PreemptiveEngine


@pytest.fixture
def engine():
    return PreemptiveEngine()


def test_no_actions_normal(engine):
    """Normal conditions → no actions."""
    actions = engine.evaluate(
        crash_probability=10, sentiment_score=0.2, volatility=2.0,
        utilization=45, risk_score=20, positions_at_risk=0,
    )
    assert len(actions) == 0


def test_high_crash_triggers_collateral(engine):
    """Crash prob >60% → raise collateral."""
    actions = engine.evaluate(
        crash_probability=65, sentiment_score=0, volatility=3.0,
        utilization=40, risk_score=30, positions_at_risk=0,
    )
    types = [a["type"] for a in actions]
    assert "raise_collateral" in types
    collateral_action = [a for a in actions if a["type"] == "raise_collateral"][0]
    assert collateral_action["amount_bps"] == 1000


def test_high_util_triggers_rate(engine):
    """Utilization >85% → raise rate."""
    actions = engine.evaluate(
        crash_probability=10, sentiment_score=0, volatility=2.0,
        utilization=90, risk_score=30, positions_at_risk=0,
    )
    types = [a["type"] for a in actions]
    assert "raise_rate" in types


def test_negative_sentiment(engine):
    """Negative sentiment → raise rate."""
    actions = engine.evaluate(
        crash_probability=10, sentiment_score=-0.7, volatility=2.0,
        utilization=40, risk_score=30, positions_at_risk=0,
    )
    types = [a["type"] for a in actions]
    assert "raise_rate" in types


def test_positions_at_risk_warns(engine):
    """3+ positions at risk → warning."""
    actions = engine.evaluate(
        crash_probability=10, sentiment_score=0, volatility=2.0,
        utilization=40, risk_score=30, positions_at_risk=5,
    )
    types = [a["type"] for a in actions]
    assert "warn" in types


def test_multiple_signals_compound(engine):
    """Multiple danger signals → multiple actions."""
    actions = engine.evaluate(
        crash_probability=70, sentiment_score=-0.8, volatility=7.0,
        utilization=88, risk_score=75, positions_at_risk=4,
    )
    assert len(actions) >= 3  # crash + sentiment + volatility + util + risk + warn


def test_summarize(engine):
    """Summary returns readable string."""
    actions = engine.evaluate(
        crash_probability=70, sentiment_score=0, volatility=2.0,
        utilization=40, risk_score=30, positions_at_risk=0,
    )
    summary = engine.summarize(actions)
    assert "raise_collateral" in summary
    assert len(summary) > 10
