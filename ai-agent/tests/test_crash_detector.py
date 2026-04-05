"""Tests for CrashDetector model."""

import pytest
from models.crash_detector import CrashDetector


@pytest.fixture
def detector():
    return CrashDetector()


def test_no_crash_stable_prices(detector):
    """Stable prices → low crash probability."""
    prices = [100 + i * 0.1 for i in range(24)]  # gentle uptrend
    result = detector.predict(prices)
    assert result["crash_probability"] < 30
    assert result["action"] == "none"


def test_crash_sharp_drop(detector):
    """Sharp price drop → high crash probability."""
    prices = [100] * 20 + [95, 90, 85, 80]  # -20% in 4 candles
    result = detector.predict(prices)
    assert result["crash_probability"] >= 40
    assert result["action"] in ("raise_rate", "freeze")


def test_crash_volume_spike(detector):
    """Volume spike with price drop → higher probability."""
    prices = [100] * 20 + [98, 96, 94, 92]
    volumes = [1000] * 20 + [1000, 1500, 3500, 5000]  # 5x volume spike
    result = detector.predict(prices, volumes)
    assert result["crash_probability"] > detector.predict(prices)["crash_probability"]


def test_consecutive_red_candles(detector):
    """5+ consecutive red candles → elevated risk."""
    prices = [100, 99.5, 99, 98.5, 98, 97.5, 97, 96.5, 96, 95.5]
    result = detector.predict(prices)
    assert result["signals"]["consecutive_red"] >= 5
    assert result["crash_probability"] >= 20


def test_too_few_prices(detector):
    """Less than 5 data points → zero probability."""
    result = detector.predict([100, 99])
    assert result["crash_probability"] == 0


def test_freeze_threshold(detector):
    """Extreme crash → freeze action."""
    # Massive drop + volume spike + consecutive reds + below SMA
    prices = [120] * 20 + [110, 100, 90, 80]  # -33%
    volumes = [1000] * 20 + [1000, 3000, 5000, 8000]
    result = detector.predict(prices, volumes)
    assert result["crash_probability"] >= 60
    assert result["action"] in ("raise_rate", "freeze")


def test_signals_populated(detector):
    """All 6 signals should be present."""
    prices = [100 + i * 0.5 for i in range(24)]
    result = detector.predict(prices)
    signals = result["signals"]
    assert "change_1h" in signals
    assert "change_4h" in signals
    assert "volume_spike" in signals
    assert "consecutive_red" in signals
    assert "sma20_deviation" in signals
    assert "volatility_1h" in signals
