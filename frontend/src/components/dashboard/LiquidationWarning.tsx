import { useState, useEffect } from "react";
import { fetchLiquidationPredict } from "../../lib/api";
import { useLang } from "../../hooks/useLang";

interface Props {
  wallet?: string;
}

export default function LiquidationWarning({ wallet }: Props) {
  const { t } = useLang();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!wallet) return;
    fetchLiquidationPredict(wallet).then(setData).catch(() => {});
    const interval = setInterval(() => {
      fetchLiquidationPredict(wallet).then(setData).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [wallet]);

  if (!data || data.risk_level === "safe") return null;

  const colors: Record<string, string> = {
    critical: "border-red-500/50 bg-red-900/20",
    high: "border-orange-500/50 bg-orange-900/20",
    moderate: "border-yellow-500/50 bg-yellow-900/20",
  };

  return (
    <div className={`rounded-xl p-4 border ${colors[data.risk_level] || "border-gray-700"}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-red-400">{t("liquidationRisk")}</span>
        <span className="text-xs text-gray-400">HF: {data.health_factor?.toFixed(2)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-2">
        {(["1h", "4h", "24h"] as const).map(h => (
          <div key={h} className="text-center">
            <div className={`text-lg font-bold ${data.probabilities[h] > 30 ? "text-red-400" : data.probabilities[h] > 10 ? "text-yellow-400" : "text-gray-400"}`}>
              {data.probabilities[h]}%
            </div>
            <div className="text-xs text-gray-500">{h}</div>
          </div>
        ))}
      </div>
      {data.recommendation && (
        <p className="text-xs text-gray-400">{data.recommendation}</p>
      )}
    </div>
  );
}
