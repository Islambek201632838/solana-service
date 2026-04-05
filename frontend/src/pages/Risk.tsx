import { useState, useEffect } from "react";
import { fetchRiskDashboard, fetchLiquidationQueue } from "../lib/api";
import { useLang } from "../hooks/useLang";

export default function Risk() {
  const { t } = useLang();
  const [dashboard, setDashboard] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchRiskDashboard(), fetchLiquidationQueue()])
      .then(([d, q]) => { setDashboard(d); setQueue(q); })
      .catch(console.error)
      .finally(() => setLoading(false));
    const interval = setInterval(() => {
      Promise.all([fetchRiskDashboard(), fetchLiquidationQueue()])
        .then(([d, q]) => { setDashboard(d); setQueue(q); })
        .catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-400">{t("loading")}...</div>;
  if (!dashboard) return <div className="p-6 text-center text-red-400">Failed to load risk data</div>;

  const m = dashboard.market;
  const p = dashboard.protocol;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white">{t("riskDashboard")}</h1>

      {/* Market + Protocol grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm text-gray-400 mb-3">{t("market")}</h2>
          <div className="space-y-2 text-sm">
            <Row label="SOL" value={`$${m.sol_price?.toFixed(2)}`} />
            <Row label={t("priceAge")} value={`${m.price_age_seconds}s`}
              color={m.price_stale ? "text-red-400" : "text-green-400"} />
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm text-gray-400 mb-3">{t("protocol")}</h2>
          <div className="space-y-2 text-sm">
            <Row label={t("utilization")} value={`${p.utilization_pct?.toFixed(1)}%`}
              color={p.utilization_pct > 80 ? "text-red-400" : p.utilization_pct > 50 ? "text-yellow-400" : "text-green-400"} />
            <Row label={t("totalDeposits")} value={`$${p.total_deposits_usd?.toFixed(0)}`} />
            <Row label={t("totalBorrows")} value={`$${p.total_borrows_usd?.toFixed(0)}`} />
            <Row label={t("collateral")} value={`${p.total_collateral_sol?.toFixed(2)} SOL ($${p.collateral_usd?.toFixed(0)})`} />
            <Row label={t("insuranceFund")} value={`$${p.insurance_balance_usd?.toFixed(2)} (${p.insurance_coverage_pct?.toFixed(1)}%)`}
              color={p.insurance_coverage_pct > 5 ? "text-green-400" : "text-yellow-400"} />
            <Row label={t("mood")} value={p.mood} />
          </div>
        </div>
      </div>

      {/* Liquidation Queue */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm text-gray-400">{t("liquidationQueue")}</h2>
          <span className="text-xs text-gray-500">
            {queue?.total_at_risk || 0} {t("atRisk")} / {queue?.total_watching || 0} {t("watching")}
          </span>
        </div>
        {queue?.positions?.length > 0 ? (
          <div className="space-y-2">
            {queue.positions.map((pos: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-900/50 rounded-lg p-2">
                <div>
                  <span className="text-gray-300 font-mono text-xs">{pos.address?.slice(0, 8)}...</span>
                  <span className={`ml-2 font-bold ${pos.health_factor < 1 ? "text-red-400" : "text-yellow-400"}`}>
                    HF: {pos.health_factor?.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-gray-400">${pos.debt_usd?.toFixed(0)} debt</div>
                  <div className="text-xs text-green-400">${pos.reward_estimate_usd?.toFixed(2)} reward</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 text-sm py-4">{t("noPositionsAtRisk")}</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}
