"""Model Reputation — tracks per-model accuracy with rolling window.

After each cycle, compare prediction vs reality.
Better models get more weight in decisions. Poor models lose influence.
"""

from collections import deque


class ModelReputation:
    def __init__(self, window: int = 50):
        self.history: dict[str, deque] = {
            "trend_predictor": deque(maxlen=window),
            "anomaly_detector": deque(maxlen=window),
            "volatility_model": deque(maxlen=window),
            "risk_scorer": deque(maxlen=window),
            "crash_detector": deque(maxlen=window),
        }
        self._last_predictions: dict[str, float] = {}

    def store_prediction(self, model: str, predicted: float):
        """Store prediction for later comparison."""
        self._last_predictions[model] = predicted

    def record_outcome(self, model: str, actual: float):
        """After next cycle, compare prediction vs actual."""
        predicted = self._last_predictions.get(model)
        if predicted is None:
            return
        # Accuracy: 1.0 - normalized error (capped at 0)
        if actual == 0 and predicted == 0:
            accuracy = 1.0
        elif actual == 0:
            accuracy = 0.0
        else:
            error = abs(predicted - actual) / max(abs(actual), 1)
            accuracy = max(0.0, 1.0 - error)
        self.history[model].append(accuracy)

    def record_binary(self, model: str, correct: bool):
        """For binary predictions (anomaly, trend direction)."""
        self.history[model].append(1.0 if correct else 0.0)

    def get_accuracy(self, model: str) -> float:
        """Average accuracy for a model (0-1)."""
        hist = self.history.get(model, deque())
        if len(hist) < 3:
            return 0.5  # default until enough data
        return sum(hist) / len(hist)

    def get_weights(self) -> dict[str, float]:
        """Dynamic weights based on recent accuracy. Normalized to sum=1."""
        raw = {}
        for model in self.history:
            acc = self.get_accuracy(model)
            raw[model] = max(0.1, acc)  # floor at 0.1 so no model is fully ignored

        total = sum(raw.values())
        if total == 0:
            n = len(raw)
            return {k: 1.0 / n for k in raw}
        return {k: round(v / total, 4) for k, v in raw.items()}

    def get_stats(self) -> dict:
        """Full stats for API/frontend."""
        stats = {}
        weights = self.get_weights()
        for model in self.history:
            acc = self.get_accuracy(model)
            stats[model] = {
                "accuracy": round(acc * 100, 1),
                "weight": weights.get(model, 0),
                "samples": len(self.history[model]),
            }
        return stats

    def summary(self) -> str:
        """One-line summary for logging."""
        parts = []
        for model, stat in self.get_stats().items():
            short = model.replace("_predictor", "").replace("_detector", "").replace("_model", "").replace("_scorer", "")
            parts.append(f"{short}={stat['accuracy']:.0f}%")
        return " ".join(parts)
