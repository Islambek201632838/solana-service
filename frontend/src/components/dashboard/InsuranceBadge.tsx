import { useLang } from "../../hooks/useLang";

interface Props {
  insurancePct: number;
  balanceUsd: number;
  totalBorrowsUsd: number;
  badDebtCoveredUsd: number;
  interestRatePct?: number;
}

export default function InsuranceBadge({ insurancePct, balanceUsd, totalBorrowsUsd, badDebtCoveredUsd, interestRatePct }: Props) {
  const { t } = useLang();
  const coverage = totalBorrowsUsd > 0 ? (balanceUsd / totalBorrowsUsd) * 100 : 100;
  const barColor = coverage > 5 ? "bg-green-500" : coverage > 2 ? "bg-yellow-500" : "bg-red-500";
  const barWidth = Math.min(100, coverage * 10);

  // Projected insurance accumulation based on current borrows & rate
  const rate = interestRatePct ?? 0;
  const annualInterest = totalBorrowsUsd * (rate / 100);
  const annualInsurance = annualInterest * (insurancePct / 100);
  const dailyInsurance = annualInsurance / 365;

  // Always show full precision — no rounding
  const displayBalance = `$${balanceUsd.toFixed(6)}`;

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">{t("insuranceFund")}</span>
        <span className="text-xs text-gray-500">{insurancePct}% {t("ofInterest")}</span>
      </div>
      <div className="text-xl font-bold text-white">{displayBalance}</div>

      {/* Projected growth */}
      {annualInsurance > 0 && (
        <div className="mt-1.5 text-xs text-green-400/80 space-y-0.5">
          <div>+${dailyInsurance.toFixed(4)}/day &middot; +${annualInsurance.toFixed(2)}/year</div>
          <div className="text-gray-500">
            Based on ${totalBorrowsUsd.toFixed(0)} borrows @ {rate.toFixed(2)}% APY
          </div>
        </div>
      )}

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
