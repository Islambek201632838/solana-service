import { useLang } from "../../hooks/useLang";

interface Props {
  insurancePct: number;
  balanceUsd: number;
  totalBorrowsUsd: number;
  badDebtCoveredUsd: number;
}

export default function InsuranceBadge({ insurancePct, balanceUsd, totalBorrowsUsd, badDebtCoveredUsd }: Props) {
  const { t } = useLang();
  const coverage = totalBorrowsUsd > 0 ? (balanceUsd / totalBorrowsUsd) * 100 : 100;
  const barColor = coverage > 5 ? "bg-green-500" : coverage > 2 ? "bg-yellow-500" : "bg-red-500";
  const barWidth = Math.min(100, coverage * 10); // scale: 10% coverage = full bar

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">{t("insuranceFund")}</span>
        <span className="text-xs text-gray-500">{insurancePct}% {t("ofInterest")}</span>
      </div>
      <div className="text-xl font-bold text-white">${balanceUsd.toFixed(2)}</div>
      <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
        <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>{coverage.toFixed(1)}% {t("coverage")}</span>
        <span>{t("badDebtCovered")}: ${badDebtCoveredUsd.toFixed(2)}</span>
      </div>
    </div>
  );
}
