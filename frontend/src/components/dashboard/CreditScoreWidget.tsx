import { useState, useEffect } from "react";
import { fetchCreditScore } from "../../lib/api";
import { useLang } from "../../hooks/useLang";

interface Props {
  wallet?: string;
}

const tierColors: Record<string, string> = {
  Platinum: "text-purple-400",
  Gold: "text-yellow-400",
  Silver: "text-gray-300",
  Bronze: "text-orange-400",
};

export default function CreditScoreWidget({ wallet }: Props) {
  const { t } = useLang();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!wallet) return;
    fetchCreditScore(wallet).then(setData).catch(() => {});
  }, [wallet]);

  if (!data) return null;

  const pct = data.score;
  const color = tierColors[data.tier] || "text-white";
  const barColor = pct >= 90 ? "bg-purple-500" : pct >= 70 ? "bg-yellow-500" : pct >= 50 ? "bg-gray-400" : "bg-orange-500";

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">{t("creditScore")}</span>
        <span className={`text-sm font-bold ${color}`}>{data.tier}</span>
      </div>
      <div className="flex items-end gap-3 mb-2">
        <span className="text-3xl font-bold text-white">{data.score}</span>
        <span className="text-sm text-gray-500 mb-1">/ 100</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
        <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1 text-xs">
        {Object.entries(data.factors || {}).map(([key, val]: [string, any]) => (
          <div key={key} className="flex justify-between">
            <span className="text-gray-500">{key.replace(/_/g, " ")}</span>
            <span className="text-gray-400">{val.score}/{val.max}</span>
          </div>
        ))}
      </div>
      {data.collateral_discount_pct > 0 && (
        <div className="mt-2 text-xs text-green-400">
          {t("collateral")} -{data.collateral_discount_pct}% | Rate -{data.rate_discount_pct}%
        </div>
      )}
    </div>
  );
}
