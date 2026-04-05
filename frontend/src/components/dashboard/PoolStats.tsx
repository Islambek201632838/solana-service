import { useLang } from "../../hooks/useLang";

interface Props {
  stats: any;
  loading: boolean;
}


export default function PoolStats({ stats, loading }: Props) {
  const { t } = useLang();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500">
        {t("poolNotConnected")}
      </div>
    );
  }

  const deposits = stats.total_deposits_usd ?? 0;
  const borrows = stats.total_borrows_usd ?? 0;
  const lendRate = stats.lend_rate_pct ?? 0;
  const borrowRate = stats.borrow_rate_pct ?? 0;
  const dailyEarning = deposits * lendRate / 100 / 365;
  const monthlyEarning = deposits * lendRate / 100 / 12;
  const yearlyEarning = deposits * lendRate / 100;
  const dailyCost = borrows * borrowRate / 100 / 365;
  const monthlyCost = borrows * borrowRate / 100 / 12;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gray-900 rounded-xl border border-green-800/30 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-green-400 text-sm font-medium">{t("lendRate")}</h3>
          <span className="text-green-400 font-bold">{lendRate.toFixed(2)}% APY</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">{t("totalDeposits")}</span>
            <span className="font-bold text-white">${deposits.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{t("utilization")}</span>
            <span className="text-white">{stats.utilization_pct?.toFixed(1) ?? 0}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{t("collateral")}</span>
            <span className="text-white">{stats.collateral_ratio_pct?.toFixed(0) ?? 0}%</span>
          </div>
          <div className="border-t border-gray-800 pt-2 mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("perDay")}</span>
              <span className="text-green-400">${dailyEarning.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("perMonth")}</span>
              <span className="text-green-400">${monthlyEarning.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("perYear")}</span>
              <span className="text-green-400 font-bold">${yearlyEarning.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-orange-800/30 p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-orange-400 text-sm font-medium">{t("borrowRate")}</h3>
          <span className="text-orange-400 font-bold">{borrowRate.toFixed(2)}% APR</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">{t("totalBorrows")}</span>
            <span className="font-bold text-white">${borrows.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{t("liquidity")}</span>
            <span className="text-white">${stats.available_liquidity_usd?.toLocaleString() ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">{t("aiUpdates")}</span>
            <span className="text-white">{stats.total_ai_updates ?? 0}</span>
          </div>
          <div className="border-t border-gray-800 pt-2 mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("perDay")}</span>
              <span className="text-orange-400">${dailyCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("perMonth")}</span>
              <span className="text-orange-400">${monthlyCost.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
