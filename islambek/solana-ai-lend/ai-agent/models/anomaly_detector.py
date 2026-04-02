"""Anomaly Detector — IsolationForest on price/volume data."""

import numpy as np
from sklearn.ensemble import IsolationForest


class AnomalyDetector:
    def __init__(self, contamination: float = 0.05):
        self.model = IsolationForest(
            contamination=contamination, random_state=42, n_estimators=100
        )

    def detect(self, prices: list[float], volumes: list[float] | None = None) -> dict:
        """Fit on recent data and check if latest point is anomalous.

        Returns: {"is_anomaly": bool, "anomaly_score": float (-1 to 0)}
        """
        if len(prices) < 10:
            return {"is_anomaly": False, "anomaly_score": 0.0}

        arr = np.array(prices, dtype=float)
        returns = np.diff(arr) / arr[:-1]

        if volumes and len(volumes) == len(prices):
            vol_arr = np.array(volumes[1:], dtype=float)
            vol_norm = vol_arr / (np.max(vol_arr) + 1e-10)
            features = np.column_stack([returns, vol_norm])
        else:
            features = returns.reshape(-1, 1)

        self.model.fit(features)
        scores = self.model.score_samples(features)
        latest_score = float(scores[-1])
        prediction = self.model.predict(features[-1:])

        return {
            "is_anomaly": bool(prediction[0] == -1),
            "anomaly_score": round(latest_score, 4),
        }
