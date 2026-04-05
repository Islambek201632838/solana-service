import { useState, useEffect } from "react";
import { fetchModelStats } from "../../lib/api";
import { useLang } from "../../hooks/useLang";

export default function ModelPerformance() {
  const { t } = useLang();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchModelStats().then(setData).catch(() => {});
  }, []);

  if (!data) return null;

  const models = data.models || {};
  const summary = data.summary || {};

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium text-gray-400">{t("modelPerformance")}</h3>
        <span className="text-xs text-gray-500">{summary.total_decisions} decisions</span>
      </div>
      <div className="space-y-2">
        {Object.entries(models).map(([name, info]: [string, any]) => {
          const barWidth = Math.min(100, info.accuracy);
          const color = info.accuracy >= 70 ? "bg-green-500" : info.accuracy >= 50 ? "bg-yellow-500" : "bg-red-500";
          const short = name.replace("_predictor", "").replace("_detector", "").replace("_model", "").replace("_scorer", "");
          return (
            <div key={name}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 capitalize">{short}</span>
                <span className="text-gray-500">{info.accuracy}% <span className="text-gray-600">w:{info.weight}</span></span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {summary.avg_confidence > 0 && (
        <div className="mt-3 flex justify-between text-xs text-gray-500">
          <span>{t("avgConfidence")}: {summary.avg_confidence}%</span>
          <span>{t("avgRateChange")}: {summary.avg_rate_change_bps} bps</span>
        </div>
      )}
    </div>
  );
}
