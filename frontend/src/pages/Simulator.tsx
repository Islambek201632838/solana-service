import { useState } from "react";
import { fetchSimulate } from "../lib/api";
import { useLang } from "../hooks/useLang";
import { usePool } from "../hooks/usePool";

export default function Simulator() {
  const { t } = useLang();
  const { stats } = usePool();
  const [rateBps, setRateBps] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const currentRate = stats?.interest_rate_pct ? Math.round(stats.interest_rate_pct * 100) : 0;

  async function runSim() {
    const r = parseInt(rateBps) || currentRate;
    setLoading(true);
    try {
      const data = await fetchSimulate(r, 0);
      setResult(data);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }

  const riskColors: Record<string, string> = {
    low: "text-green-400",
    medium: "text-yellow-400",
    high: "text-red-400",
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold">{t("simulateTitle")}</h2>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">
            Current rate: {currentRate} bps ({(currentRate / 100).toFixed(2)}%)
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              placeholder={t("newRate")}
              value={rateBps}
              onChange={(e) => setRateBps(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={runSim}
              disabled={loading}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium disabled:opacity-50 transition"
            >
              {loading ? "..." : t("runSimulation")}
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            {[currentRate - 50, currentRate + 50, currentRate + 100, currentRate + 200].filter(v => v > 0).map((v) => (
              <button
                key={v}
                onClick={() => { setRateBps(String(v)); }}
                className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
              >
                {v} bps
              </button>
            ))}
          </div>
        </div>

        {result && (
          <div className="space-y-3 pt-3 border-t border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300">{t("impactPreview")}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{t("utilizationChange")}</p>
                <p className="text-sm font-medium">
                  {result.impact.utilization_current_pct}% &rarr; {result.impact.utilization_estimated_pct}%
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{t("borrowerCost")}</p>
                <p className="text-sm font-medium">
                  ${result.impact.borrower_cost_monthly_usd}
                  <span className={`ml-1 text-xs ${result.impact.borrower_cost_change_usd >= 0 ? "text-red-400" : "text-green-400"}`}>
                    {result.impact.borrower_cost_change_usd >= 0 ? "+" : ""}{result.impact.borrower_cost_change_usd}
                  </span>
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{t("depositorYield")}</p>
                <p className="text-sm font-medium">${result.impact.depositor_yield_monthly_usd}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{t("protocolRevenue")}</p>
                <p className="text-sm font-medium">${result.impact.protocol_revenue_monthly_usd}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-gray-500">{t("riskAssessment")}:</span>
              <span className={`text-sm font-medium ${riskColors[result.risk_assessment.level] ?? "text-gray-400"}`}>
                {result.risk_assessment.level?.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">&mdash; {result.risk_assessment.detail}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
