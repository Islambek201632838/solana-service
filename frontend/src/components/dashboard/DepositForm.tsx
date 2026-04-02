import { useState } from "react";
import { useBreakpoint } from "../../hooks/useMediaQuery";
import { useLang } from "../../hooks/useLang";

interface Props {
  onDeposit: (amount: number) => Promise<void>;
  maxBalance: number;
  loading: boolean;
}

const PRESETS = [0.25, 0.5, 0.75, 1.0];

export default function DepositForm({ onDeposit, maxBalance, loading }: Props) {
  const [amount, setAmount] = useState("");
  const { isMobile } = useBreakpoint();
  const { t } = useLang();

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    await onDeposit(val);
    setAmount("");
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">{t("depositAiusdc")}</h3>

      <div className="flex gap-2 mb-3">
        {PRESETS.map((pct) => (
          <button
            key={pct}
            onClick={() => setAmount((maxBalance * pct).toFixed(2))}
            className="flex-1 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 min-h-[36px]"
          >
            {pct === 1 ? "MAX" : `${pct * 100}%`}
          </button>
        ))}
      </div>

      <div className={`flex ${isMobile ? "flex-col" : "flex-row"} gap-3`}>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("amountPlaceholder")}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-[16px] outline-none focus:border-purple-500"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !amount}
          className={`bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg px-6 py-3 font-medium min-h-[48px] ${
            isMobile ? "w-full" : ""
          }`}
        >
          {loading ? t("signing") : t("depositBtn")}
        </button>
      </div>

      <p className="text-xs text-gray-600 mt-2">
        {t("balance")}: {maxBalance.toLocaleString()} aiUSDC
      </p>
    </div>
  );
}
