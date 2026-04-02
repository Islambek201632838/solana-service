"""Quant Engine — pure mathematical indicators using numpy.

All functions are stateless and operate on price arrays.
"""

import numpy as np
import pandas as pd


def calc_ema(prices: list[float], period: int) -> np.ndarray:
    """Exponential Moving Average (vectorized via pandas)."""
    return pd.Series(prices, dtype=float).ewm(span=period, adjust=False).mean().to_numpy()


def calc_rsi(prices: list[float], period: int = 14) -> float:
    """Relative Strength Index (Wilder's smoothing, vectorized).

    Returns RSI value (0-100) for the most recent price.
    Requires at least period+1 data points.
    """
    arr = np.array(prices, dtype=float)
    if len(arr) < period + 1:
        return 50.0

    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    # Wilder's smoothing via pandas ewm (com = period - 1)
    avg_gain = pd.Series(gains).ewm(com=period - 1, min_periods=period).mean().iloc[-1]
    avg_loss = pd.Series(losses).ewm(com=period - 1, min_periods=period).mean().iloc[-1]

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def calc_macd(
    prices: list[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> dict:
    """MACD indicator.

    Returns: {"macd": float, "signal": float, "histogram": float, "trend": str}
    """
    arr = np.array(prices, dtype=float)
    if len(arr) < slow + signal:
        return {"macd": 0, "signal": 0, "histogram": 0, "trend": "neutral"}

    ema_fast = calc_ema(prices, fast)
    ema_slow = calc_ema(prices, slow)
    macd_line = ema_fast - ema_slow
    signal_line = calc_ema(macd_line.tolist(), signal)

    macd_val = float(macd_line[-1])
    signal_val = float(signal_line[-1])
    histogram = macd_val - signal_val

    if macd_val > signal_val:
        trend = "bullish"
    elif macd_val < signal_val:
        trend = "bearish"
    else:
        trend = "neutral"

    return {
        "macd": round(macd_val, 4),
        "signal": round(signal_val, 4),
        "histogram": round(histogram, 4),
        "trend": trend,
    }


def calc_bollinger(
    prices: list[float], period: int = 20, std_dev: float = 2.0
) -> dict:
    """Bollinger Bands.

    Returns: {"upper": float, "middle": float, "lower": float, "width": float, "position": str}
    """
    arr = np.array(prices, dtype=float)
    if len(arr) < period:
        return {"upper": 0, "middle": 0, "lower": 0, "width": 0, "position": "neutral"}

    sma = np.mean(arr[-period:])
    std = np.std(arr[-period:], ddof=0)
    upper = sma + std_dev * std
    lower = sma - std_dev * std
    width = (upper - lower) / sma if sma > 0 else 0

    current = arr[-1]
    if current > upper:
        position = "above"  # overbought
    elif current < lower:
        position = "below"  # oversold
    else:
        position = "inside"

    return {
        "upper": round(float(upper), 4),
        "middle": round(float(sma), 4),
        "lower": round(float(lower), 4),
        "width": round(float(width), 4),
        "position": position,
    }


def calc_atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> float:
    """Average True Range — volatility indicator.

    Requires at least period+1 data points.
    """
    h = np.array(highs, dtype=float)
    l = np.array(lows, dtype=float)
    c = np.array(closes, dtype=float)

    if len(h) < period + 1:
        return 0.0

    # True Range: max(high-low, |high-prev_close|, |low-prev_close|)
    tr = np.maximum(
        h[1:] - l[1:],
        np.maximum(
            np.abs(h[1:] - c[:-1]),
            np.abs(l[1:] - c[:-1]),
        ),
    )

    # Wilder's smoothing via pandas ewm
    atr = pd.Series(tr).ewm(com=period - 1, min_periods=period).mean().iloc[-1]
    return round(float(atr), 4)


def calc_ema_crossover(prices: list[float], fast: int = 9, slow: int = 21) -> str:
    """EMA crossover signal.

    Returns: "bullish_cross", "bearish_cross", or "no_cross"
    """
    if len(prices) < slow + 2:
        return "no_cross"

    ema_fast = calc_ema(prices, fast)
    ema_slow = calc_ema(prices, slow)

    prev_diff = ema_fast[-2] - ema_slow[-2]
    curr_diff = ema_fast[-1] - ema_slow[-1]

    if prev_diff <= 0 and curr_diff > 0:
        return "bullish_cross"
    elif prev_diff >= 0 and curr_diff < 0:
        return "bearish_cross"
    return "no_cross"
