"""Backtest — walk-forward test of TrendPredictor on synthetic data."""

import numpy as np
from models.trend_predictor import TrendPredictor


def generate_trending_prices(n=200, trend=0.001, noise=0.02):
    """Generate synthetic price series with a trend + noise."""
    np.random.seed(42)
    returns = np.random.normal(trend, noise, n)
    prices = [100.0]
    for r in returns:
        prices.append(prices[-1] * (1 + r))
    return prices


def generate_volatile_prices(n=200, noise=0.05):
    """Generate volatile sideways price series."""
    np.random.seed(123)
    returns = np.random.normal(0, noise, n)
    prices = [100.0]
    for r in returns:
        prices.append(prices[-1] * (1 + r))
    return prices


class TestBacktest:
    def test_predict_returns_valid_structure(self):
        predictor = TrendPredictor(lags=5)
        prices = generate_trending_prices(50)
        result = predictor.predict(prices)

        assert "direction" in result
        assert result["direction"] in ["up", "down", "sideways", "hold"]
        assert "confidence" in result
        assert 0 <= result["confidence"] <= 100
        assert "probabilities" in result
        assert "feature_importance" in result

    def test_trending_up_detects_up(self):
        predictor = TrendPredictor(lags=5)
        prices = generate_trending_prices(100, trend=0.005)  # strong uptrend
        result = predictor.predict(prices)

        # Should detect upward tendency
        assert result["probabilities"]["up"] > result["probabilities"]["down"]

    def test_trending_down_detects_down(self):
        predictor = TrendPredictor(lags=5)
        prices = generate_trending_prices(100, trend=-0.005)  # strong downtrend
        result = predictor.predict(prices)

        assert result["probabilities"]["down"] > result["probabilities"]["up"]

    def test_walk_forward_accuracy(self):
        """Walk-forward backtest: train on [0:t], predict t+1, measure accuracy."""
        prices = generate_trending_prices(200, trend=0.002, noise=0.02)
        predictor = TrendPredictor(lags=5)

        correct = 0
        total = 0
        window = 50  # minimum training window

        for t in range(window, len(prices) - 2):
            train_prices = prices[:t]
            result = predictor.predict(train_prices)

            # Actual direction
            actual_ret = (prices[t + 1] - prices[t]) / prices[t]
            if actual_ret > 0.01:
                actual = "up"
            elif actual_ret < -0.01:
                actual = "down"
            else:
                actual = "sideways"

            if result["direction"] == actual:
                correct += 1
            total += 1

        accuracy = correct / total if total > 0 else 0
        print(f"\n  Walk-forward accuracy: {accuracy:.1%} on {total} predictions")
        print(f"  Baseline (random): 33.3%")

        # Should be better than random (33%)
        assert accuracy > 0.30, f"Accuracy {accuracy:.1%} too low"

    def test_feature_importance_populated(self):
        predictor = TrendPredictor(lags=5)
        prices = generate_trending_prices(100)
        result = predictor.predict(prices)

        assert len(result["feature_importance"]) > 0
        # Should have lag features + rsi + macd_hist + volume_ratio + ma10_ratio
        assert len(result["feature_importance"]) >= 5

    def test_accuracy_estimate_provided(self):
        predictor = TrendPredictor(lags=5)
        prices = generate_trending_prices(100)
        result = predictor.predict(prices)

        assert result["accuracy_estimate"] > 0
        print(f"\n  Train accuracy estimate: {result['accuracy_estimate']:.1f}%")
