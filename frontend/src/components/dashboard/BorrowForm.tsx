import { useState } from "react";
import { useBreakpoint } from "../../hooks/useMediaQuery";
import { useLang } from "../../hooks/useLang";

interface Props {
  onBorrow: (amount: number) => Promise<void>;
  collateralSol: number;
  solPrice: number;
  collateralRatio: number;
  currentBorrowed: number;
  loading: boolean;
}

export default function BorrowForm({
  onBorrow, collateralSol, solPrice, collateralRatio, currentBorrowed, loading,
}: Props) {
  const [amount, setAmount] = useState("");
  const { isMobile } = useBreakpoint();
  const { t } = useLang();

  const collateralValueUsd = collateralSol * solPrice;
  const maxBorrow = collateralRatio > 0 ? collateralValueUsd / (collateralRatio / 100) : 0;
  const availableToBorrow = Math.max(0, maxBorrow - currentBorrowed);
  const usedPct = maxBorrow > 0 ? ((currentBorrowed + (parseFloat(amount) || 0)) / maxBorrow) * 100 : 0;

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    await onBorrow(val);
    setAmount("");
  };

  const barColor = usedPct > 80 ? "bg-red-500" : usedPct > 60 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">{t("borrowAiusdc")}</h3>

      <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-3`}>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t("collateralLabel")}</span>
            <span>{collateralSol.toFixed(4)} SOL (${collateralValueUsd.toFixed(2)})</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t("availableToBorrow")}</span>
            <span>${availableToBorrow.toFixed(2)}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${Math.min(100, usedPct)}%` }} />
          </div>
          <p className="text-xs text-gray-600">{usedPct.toFixed(1)}% {t("borrowCapacity")}</p>
        </div>

        <div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("amountPlaceholder")}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-[16px] outline-none focus:border-purple-500 mb-3"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !amount}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-lg px-6 py-3 font-medium min-h-[48px]"
          >
            {loading ? t("signing") : t("borrowBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
