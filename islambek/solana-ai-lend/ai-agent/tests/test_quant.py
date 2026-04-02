"""Tests for Quant Engine and Utilization Curve."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent.quant_engine import (
    calc_rsi,
    calc_macd,
    calc_bollinger,
    calc_atr,
    calc_ema_crossover,
    calc_ema,
)
from agent.utilization_curve import calc_optimal_rate


# ==========================================
# RSI
# ==========================================

def test_rsi_known_data():
    """RSI on Wilder's original example data."""
    prices = [
        44.00, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84,
        46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41,
        46.22, 45.64,
    ]
    rsi = calc_rsi(prices, 14)
    assert 55 < rsi < 75, f"RSI={rsi}, expected 55-75 for this data"
    print(f"  RSI: {rsi:.2f}")


def test_rsi_all_up():
    """Monotonically increasing prices → RSI near 100."""
    prices = list(range(1, 30))
    rsi = calc_rsi(prices, 14)
    assert rsi > 95, f"RSI={rsi}, expected >95 for all-up"


def test_rsi_all_down():
    """Monotonically decreasing prices → RSI near 0."""
    prices = list(range(30, 1, -1))
    rsi = calc_rsi(prices, 14)
    assert rsi < 5, f"RSI={rsi}, expected <5 for all-down"


def test_rsi_insufficient_data():
    """Less than period+1 data points → neutral 50."""
    rsi = calc_rsi([100, 101, 102], 14)
    assert rsi == 50.0


# ==========================================
# MACD
# ==========================================

def test_macd_bullish():
    """Uptrend data → bullish MACD."""
    prices = [i + (i * 0.01) for i in range(50)]
    result = calc_macd(prices)
    assert result["trend"] == "bullish"
    assert result["macd"] > 0
    print(f"  MACD: {result['macd']}, signal: {result['signal']}, trend: {result['trend']}")


def test_macd_structure():
    """Verify MACD returns all expected keys."""
    prices = list(range(1, 50))
    result = calc_macd(prices)
    assert "macd" in result
    assert "signal" in result
    assert "histogram" in result
    assert "trend" in result


def test_macd_insufficient_data():
    prices = [1, 2, 3]
    result = calc_macd(prices)
    assert result["trend"] == "neutral"


# ==========================================
# Bollinger Bands
# ==========================================

def test_bollinger_inside():
    """Stable prices → current price inside bands."""
    prices = [100 + (i % 3) for i in range(30)]
    result = calc_bollinger(prices, period=20)
    assert result["position"] == "inside"
    assert result["upper"] > result["middle"] > result["lower"]
    print(f"  Bollinger: upper={result['upper']}, mid={result['middle']}, lower={result['lower']}")


def test_bollinger_above():
    """Spike at end → above upper band."""
    prices = [100.0] * 25 + [200.0]
    result = calc_bollinger(prices, period=20)
    assert result["position"] == "above"


def test_bollinger_below():
    """Drop at end → below lower band."""
    prices = [100.0] * 25 + [10.0]
    result = calc_bollinger(prices, period=20)
    assert result["position"] == "below"


def test_bollinger_insufficient():
    result = calc_bollinger([1, 2, 3], period=20)
    assert result["position"] == "neutral"


# ==========================================
# ATR
# ==========================================

def test_atr_known_data():
    """ATR with known volatile data."""
    highs =  [48, 48, 48, 48, 48, 49, 49, 49, 49, 49, 50, 50, 50, 50, 50, 51]
    lows =   [46, 46, 46, 46, 46, 47, 47, 47, 47, 47, 48, 48, 48, 48, 48, 49]
    closes = [47, 47, 47, 47, 47, 48, 48, 48, 48, 48, 49, 49, 49, 49, 49, 50]
    atr = calc_atr(highs, lows, closes, period=14)
    assert atr > 0
    print(f"  ATR: {atr}")


def test_atr_zero_volatility():
    """Flat prices → ATR near 0."""
    flat = [100.0] * 20
    atr = calc_atr(flat, flat, flat, period=14)
    assert atr == 0.0


def test_atr_insufficient():
    atr = calc_atr([1, 2], [0, 1], [1, 1], period=14)
    assert atr == 0.0


# ==========================================
# EMA Crossover
# ==========================================

def test_ema_crossover_bullish():
    """Crash then recovery — fast EMA crosses above slow EMA."""
    # Stable then crash: fast EMA falls below slow
    prices = [100.0] * 30 + [60.0] * 10
    # 2 recovery points: first brings diff to ~0, second crosses positive
    prices += [100.0, 100.0]
    result = calc_ema_crossover(prices, fast=5, slow=15)
    assert result == "bullish_cross", f"Got {result}"
    print(f"  Crossover: {result}")


def test_ema_crossover_no_cross():
    """Steady uptrend → no cross."""
    prices = list(range(1, 50))
    result = calc_ema_crossover(prices, fast=9, slow=21)
    assert result == "no_cross"


def test_ema_crossover_insufficient():
    result = calc_ema_crossover([1, 2, 3], fast=9, slow=21)
    assert result == "no_cross"


# ==========================================
# Utilization Curve
# ==========================================

def test_utilization_below_kink():
    """60% utilization (below 80% kink) → gentle rate."""
    result = calc_optimal_rate(0.60, u_optimal=0.80, r_base=100, r_slope1=400, r_slope2=1500)
    assert result["zone"] == "optimal"
    assert result["optimal_rate_bps"] == 400  # 100 + 400*(0.6/0.8) = 100 + 300 = 400
    print(f"  Rate at 60% util: {result['optimal_rate_bps']} bps ({result['optimal_rate_bps']/100}%)")


def test_utilization_at_kink():
    """80% utilization (at kink) → base + full slope1."""
    result = calc_optimal_rate(0.80, u_optimal=0.80, r_base=100, r_slope1=400, r_slope2=1500)
    assert result["zone"] == "optimal"
    assert result["optimal_rate_bps"] == 500  # 100 + 400


def test_utilization_above_kink():
    """90% utilization (above kink) → steep rate."""
    result = calc_optimal_rate(0.90, u_optimal=0.80, r_base=100, r_slope1=400, r_slope2=1500)
    assert result["zone"] == "excess"
    # 100 + 400 + 1500 * (0.1/0.2) = 100 + 400 + 750 = 1250
    assert result["optimal_rate_bps"] == 1250
    print(f"  Rate at 90% util: {result['optimal_rate_bps']} bps ({result['optimal_rate_bps']/100}%)")


def test_utilization_full():
    """100% utilization → maximum rate."""
    result = calc_optimal_rate(1.0, u_optimal=0.80, r_base=100, r_slope1=400, r_slope2=1500)
    assert result["zone"] == "excess"
    assert result["optimal_rate_bps"] == 2000  # 100 + 400 + 1500


def test_utilization_zero():
    """0% utilization → base rate only."""
    result = calc_optimal_rate(0.0)
    assert result["optimal_rate_bps"] == 100  # just r_base


def test_utilization_clamped():
    """Negative/over 1.0 clamped."""
    r1 = calc_optimal_rate(-0.5)
    r2 = calc_optimal_rate(1.5)
    assert r1["utilization"] == 0.0
    assert r2["utilization"] == 1.0
