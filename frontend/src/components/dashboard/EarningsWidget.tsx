import { useLang } from "../../hooks/useLang";

interface Props {
  depositedUsd: number;
  lendRatePct: number;
  supplyApyDaily: number;
  supplyApyMonthly: number;
}

export default function EarningsWidget({ depositedUsd, lendRatePct, supplyApyDaily, supplyApyMonthly }: Props) {
  const { t } = useLang();
  const daily = depositedUsd * supplyApyDaily / 100;
  const monthly = depositedUsd * supplyApyMonthly / 100;
  const yearly = depositedUsd * lendRatePct / 100;

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">{t("lenderEarnings")}</span>
        <span className="text-xs text-green-400">{lendRatePct.toFixed(2)}% APY</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500">{t("deposit")}</div>
          <div className="text-lg font-bold text-white">${depositedUsd.toFixed(0)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">{t("lenderRate")}</div>
          <div className="text-lg font-bold text-green-400">{lendRatePct.toFixed(2)}% APY</div>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">{t("perDay")}</span>
          <span className="text-green-400">${daily.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t("perMonth")}</span>
          <span className="text-green-400">${monthly.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t("perYear")}</span>
          <span className="text-green-400 font-bold">${yearly.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
