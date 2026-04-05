import { useEffect, useState } from "react";
import { fetchLiquidationQueue } from "../../lib/api";
import { useLang } from "../../hooks/useLang";

export default function LiquidationQueueWidget() {
  const { t } = useLang();
  const [queue, setQueue] = useState<any>(null);

  useEffect(() => {
    fetchLiquidationQueue().then(setQueue).catch(() => {});
    const interval = setInterval(() => {
      fetchLiquidationQueue().then(setQueue).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!queue) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium text-gray-400">{t("liquidationQueue")}</h3>
        <span className="text-xs text-gray-500">
          {queue.total_at_risk || 0} {t("atRisk")} / {queue.total_watching || 0} {t("watching")}
        </span>
      </div>
      {queue.positions?.length > 0 ? (
        <div className="space-y-2">
          {queue.positions.slice(0, 5).map((pos: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm bg-gray-800/50 rounded-lg p-2">
              <div>
                <span className="text-gray-300 font-mono text-xs">{pos.address?.slice(0, 8)}...</span>
                <span className={`ml-2 font-bold ${pos.health_factor < 1 ? "text-red-400" : "text-yellow-400"}`}>
                  HF: {pos.health_factor?.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-gray-400 text-xs">${pos.debt_usd?.toFixed(0)}</span>
                <span className="text-green-400 text-xs ml-2">+${pos.reward_estimate_usd?.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-600 text-sm py-3">{t("noPositionsAtRisk")}</div>
      )}
    </div>
  );
}
