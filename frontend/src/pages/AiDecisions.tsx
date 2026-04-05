import { useState } from "react";
import { useLang } from "../hooks/useLang";
import AiDecisionCard from "../components/dashboard/AiDecisionCard";
import { useAiDecisions } from "../hooks/useAiDecisions";
import { useBreakpoint } from "../hooks/useMediaQuery";
import ModelPerformance from "../components/dashboard/ModelPerformance";
import type { TranslationKey } from "../lib/i18n";

const RISK_FILTERS: { value: string; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "allRiskLevels" },
  { value: "low", labelKey: "riskLow" },
  { value: "medium", labelKey: "riskMedium" },
  { value: "high", labelKey: "riskHigh" },
  { value: "critical", labelKey: "riskCritical" },
];

export default function AiDecisions() {
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState("all");
  const { isDesktop } = useBreakpoint();
  const { t } = useLang();

  // Fetch counts for each risk level
  const { data: allData } = useAiDecisions(1, 1);
  const { data: lowData } = useAiDecisions(1, 1, "low");
  const { data: medData } = useAiDecisions(1, 1, "medium");
  const { data: highData } = useAiDecisions(1, 1, "high");
  const { data: critData } = useAiDecisions(1, 1, "critical");

  const counts: Record<string, number> = {
    all: allData?.total ?? 0,
    low: lowData?.total ?? 0,
    medium: medData?.total ?? 0,
    high: highData?.total ?? 0,
    critical: critData?.total ?? 0,
  };

  const { data, loading } = useAiDecisions(
    page, 10, riskFilter === "all" ? undefined : riskFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">{t("aiDecisionsTitle")}</h2>
        <span className="text-sm text-gray-500">{data?.total ?? 0} {t("total")}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {RISK_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setRiskFilter(f.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              riskFilter === f.value
                ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
                : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
            }`}
          >
            {t(f.labelKey)}
            <span className="ml-1.5 text-xs text-gray-500">{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {false && isDesktop && (
        <select
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-[16px] text-gray-300"
        >
          {RISK_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{t(f.labelKey)}</option>
          ))}
        </select>
      )}

      <ModelPerformance />

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
      ) : (
        <div className="space-y-3">
          {data.items.map((d: any) => (
            <AiDecisionCard key={d.id} decision={d} expanded />
          ))}
        </div>
      )}

      {(() => {
        const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 10));
        if (totalPages <= 1) return null;
        return (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-400 disabled:opacity-30 hover:bg-gray-700"
            >&laquo;</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm transition ${
                    page === p ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >{p}</button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-400 disabled:opacity-30 hover:bg-gray-700"
            >&raquo;</button>
          </div>
        );
      })()}
    </div>
  );
}
