"""Trend Predictor — RandomForest classifier on lagged features.

Classifies next period as 'up' (>+1%), 'down' (<-1%), or 'sideways'.
Provides feature importance and prediction probability.
"""

import numpy as np
from pathlib import Path

from sklearn.ensemble import RandomForestClassifier

MODEL_PATH = Path("/app/data/trend_rf.joblib")


def _label(ret: float) -> int:
    """0=down, 1=sideways, 2=up"""
    if ret > 0.01:
        return 2
    elif ret < -0.01:
        return 0
    return 1


LABEL_NAMES = {0: "down", 1: "sideways", 2: "up"}
FEATURE_NAMES = []  # set after first fit


class TrendPredictor:
    def __init__(self, lags: int = 5):
        self.lags = lags
        self.model = RandomForestClassifier(
            n_estimators=50,
            max_depth=5,
            random_state=42,
            n_jobs=1,
        )
        self._is_fitted = False
        self.feature_importances: dict[str, float] = {}
        self._try_load()

    def _try_load(self):
        """Load persisted model if available."""
        try:
            if MODEL_PATH.exists():
                import joblib
                self.model = joblib.load(MODEL_PATH)
                self._is_fitted = True
                print("[TREND] Loaded saved model")
        except Exception:
            pass

    def _save(self):
        """Persist model to disk."""
        try:
            MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            import joblib
            joblib.dump(self.model, MODEL_PATH)
        except Exception:
            pass

    def _build_features(
        self, prices: list[float], volumes: list[float] | None,
        rsi: float, macd_hist: float, volume_ratio: float
    ) -> tuple[np.ndarray, np.ndarray, list[str]]:
        """Build feature matrix and labels from price data."""
        arr = np.array(prices, dtype=float)
        returns = np.diff(arr) / arr[:-1]

        X, y = [], []
        for i in range(self.lags, len(returns) - 1):
            row = list(returns[i - self.lags : i])
            row.append(rsi / 100.0)
            row.append(macd_hist)
            row.append(volume_ratio)
            # Moving average ratio
            if i >= 10:
                ma10 = np.mean(arr[i - 10 : i])
                row.append(arr[i] / ma10 - 1.0)
            else:
                row.append(0.0)
            X.append(row)
            y.append(_label(returns[i + 1]))  # predict NEXT return

        names = [f"lag_{j}" for j in range(self.lags)] + [
            "rsi", "macd_hist", "volume_ratio", "ma10_ratio"
        ]

        return np.array(X), np.array(y), names

    def predict(
        self,
        prices: list[float],
        volumes: list[float] | None = None,
        rsi: float = 50.0,
        macd_hist: float = 0.0,
        volume_ratio: float = 1.0,
    ) -> dict:
        """Predict next price direction.

        Returns: {
            "direction": "up"/"down"/"sideways",
            "predicted_change_pct": float,
            "confidence": float (0-100),
            "probabilities": {"up": float, "down": float, "sideways": float},
            "feature_importance": {name: float},
            "accuracy_estimate": float (on train data)
        }
        """
        if len(prices) < self.lags + 4:
            return {
                "direction": "hold",
                "predicted_change_pct": 0.0,
                "confidence": 0.0,
                "probabilities": {"up": 0.33, "down": 0.33, "sideways": 0.34},
                "feature_importance": {},
                "accuracy_estimate": 0.0,
            }

        X, y, names = self._build_features(prices, volumes, rsi, macd_hist, volume_ratio)

        if len(X) < 5:
            return {
                "direction": "hold",
                "predicted_change_pct": 0.0,
                "confidence": 0.0,
                "probabilities": {"up": 0.33, "down": 0.33, "sideways": 0.34},
                "feature_importance": {},
                "accuracy_estimate": 0.0,
            }

        # Train on all except last, predict last
        X_train, y_train = X[:-1], y[:-1]
        X_pred = X[-1:]

        # Only refit if enough new data
        if not self._is_fitted or len(X_train) > 10:
            unique_classes = np.unique(y_train)
            if len(unique_classes) >= 2:
                self.model.fit(X_train, y_train)
                self._is_fitted = True
                self._save()

                # Feature importance
                self.feature_importances = {
                    name: round(float(imp), 4)
                    for name, imp in zip(names, self.model.feature_importances_)
                }

        if not self._is_fitted:
            return {
                "direction": "hold",
                "predicted_change_pct": 0.0,
                "confidence": 0.0,
                "probabilities": {"up": 0.33, "down": 0.33, "sideways": 0.34},
                "feature_importance": {},
                "accuracy_estimate": 0.0,
            }

        # Predict
        pred_class = int(self.model.predict(X_pred)[0])
        pred_proba = self.model.predict_proba(X_pred)[0]

        # Map probabilities to labels
        classes = list(self.model.classes_)
        proba_dict = {"up": 0.0, "down": 0.0, "sideways": 0.0}
        for cls, prob in zip(classes, pred_proba):
            proba_dict[LABEL_NAMES[cls]] = round(float(prob), 4)

        direction = LABEL_NAMES[pred_class]
        confidence = round(float(max(pred_proba)) * 100, 2)

        # Train accuracy estimate
        train_acc = 0.0
        if len(X_train) > 5:
            train_acc = round(float(self.model.score(X_train, y_train)) * 100, 2)

        # Estimated change based on probabilities
        change_pct = (proba_dict["up"] - proba_dict["down"]) * 2.0

        return {
            "direction": direction,
            "predicted_change_pct": round(change_pct, 4),
            "confidence": confidence,
            "probabilities": proba_dict,
            "feature_importance": self.feature_importances,
            "accuracy_estimate": train_acc,
        }
