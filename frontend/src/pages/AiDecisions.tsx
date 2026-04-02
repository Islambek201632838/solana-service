import { useState } from "react";
import { useLang } from "../hooks/useLang";
import AiDecisionCard from "../components/dashboard/AiDecisionCard";
import { useAiDecisions } from "../hooks/useAiDecisions";
import { useBreakpoint } from "../hooks/useMediaQuery";

const RISK_FILTERS = ["all", "low", "medium", "high", "critical"] as const;

export default function AiDecisions() {
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const { isMobile, isDesktop } = useBreakpoint();
  const { t } = useLang();

  const { data, loading } = useAiDecisions(
    page, 10, riskFilter === "all" ? undefined : riskFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">{t("aiDecisionsTitle")}</h2>
        <span className="text-sm text-gray-500">{data?.total ?? 0} {t("total")}</span>
      </div>

      {isDesktop ? (
        <div className="flex gap-2">
          {RISK_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setRiskFilter(f); setPage(1); }}
              className={`px-4 py-2 rounded-lg text-sm capitalize ${
                riskFilter === f ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f === "all" ? t("allRiskLevels") : f}
            </button>
          ))}
        </div>
      ) : (
        <select
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-[16px] text-gray-300"
        >
          {RISK_FILTERS.map((f) => (
            <option key={f} value={f}>{f === "all" ? t("allRiskLevels") : f}</option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          {t("noAiDecisions")}
        </div>
      ) : isDesktop ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-left">
                <th className="p-3">{t("time")}</th>
                <th className="p-3">{t("rate")}</th>
                <th className="p-3">{t("change")}</th>
                <th className="p-3">{t("risk")}</th>
                <th className="p-3">{t("confidence")}</th>
                <th className="p-3">{t("tx")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d: any) => (
                <tr key={d.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 text-gray-400">{new Date(d.timestamp).toLocaleString()}</td>
                  <td className="p-3 font-mono">{(d.new_rate / 100).toFixed(2)}%</td>
                  <td className={`p-3 font-mono ${d.new_rate > d.old_rate ? "text-green-400" : d.new_rate < d.old_rate ? "text-red-400" : "text-gray-500"}`}>
                    {d.new_rate > d.old_rate ? "+" : ""}{((d.new_rate - d.old_rate) / 100).toFixed(2)}%
                  </td>
                  <td className="p-3">{d.risk_level}</td>
                  <td className="p-3">{d.confidence}%</td>
                  <td className="p-3">
                    {d.tx_signature ? (
                      <a href={`https://solscan.io/tx/${d.tx_signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                        {t("view")}
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((d: any) => (
            <AiDecisionCard key={d.id} decision={d} />
          ))}
        </div>
      )}

      {(data?.total ?? 0) > 10 && (
        isMobile ? (
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 10 >= (data?.total ?? 0)}
            className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-3 text-sm min-h-[48px]"
          >
            {t("loadMore")}
          </button>
        ) : (
          <div className="flex justify-center gap-2">
            {Array.from({ length: Math.ceil((data?.total ?? 0) / 10) }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`px-3 py-1 rounded ${page === i + 1 ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
