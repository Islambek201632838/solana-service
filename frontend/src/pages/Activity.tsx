import { useEffect, useState } from "react";
import { fetchActivity } from "../lib/api";
import { usePool } from "../hooks/usePool";
import { useLang } from "../hooks/useLang";
import type { TranslationKey } from "../lib/i18n";

const actionLabels: Record<string, TranslationKey> = {
  deposit: "actDeposit",
  borrow: "actBorrow",
  repay: "actRepay",
  deposit_collateral: "actCollateral",
  liquidate: "actLiquidate",
};

const actionColors: Record<string, string> = {
  deposit: "text-green-400",
  borrow: "text-orange-400",
  repay: "text-blue-400",
  deposit_collateral: "text-cyan-400",
  liquidate: "text-red-400",
};

const actionIcons: Record<string, string> = {
  deposit: "+",
  borrow: "\u2193",
  repay: "\u2191",
  deposit_collateral: "\u26a1",
  liquidate: "\u26a0",
};

interface ActivityItem {
  id: number;
  timestamp: string;
  action: string;
  user: string;
  amount: number;
  token: string;
  tx_signature: string;
  pool_util_after: number;
  rate_at_time: number;
}

const PAGE_SIZE = 50;

export default function Activity() {
  const { t, lang } = useLang();
  const { stats } = usePool();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchActivity(PAGE_SIZE, 0)
      .then(d => { setItems(d.items || []); setTotal(d.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await fetchActivity(PAGE_SIZE, items.length);
      setItems(prev => [...prev, ...(d.items || [])]);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  const hasMore = items.length < total;

  // Calculate earnings with separate rates
  const deposits = stats?.total_deposits_usd ?? 0;
  const borrows = stats?.total_borrows_usd ?? 0;
  const lendRate = stats?.lend_rate_pct ?? 0;
  const borrowRate = stats?.borrow_rate_pct ?? 0;
  const utilization = stats?.utilization_pct ?? 0;
  const dailyEarning = deposits * lendRate / 100 / 365;
  const monthlyEarning = deposits * lendRate / 100 / 12;
  const yearlyEarning = deposits * lendRate / 100;

  const dailyCost = borrows * borrowRate / 100 / 365;
  const monthlyCost = borrows * borrowRate / 100 / 12;

  // Count by type
  const borrowCount = items.filter(i => i.action === "borrow").length;
  const repayCount = items.filter(i => i.action === "repay").length;
  const collateralCount = items.filter(i => i.action === "deposit_collateral").length;
  const totalBorrowed = items.filter(i => i.action === "borrow").reduce((s, i) => s + i.amount, 0);
  const totalRepaid = items.filter(i => i.action === "repay").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("recentActivity")}</h2>
        <span className="text-sm text-gray-500">{items.length} / {total} {t("total")}</span>
      </div>

      {/* Earnings Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-xl border border-green-800/30 p-5">
          <h3 className="text-green-400 text-sm font-medium mb-3">
            {lang === "ru" ? "Доход лендера" : "Lender Earnings"}
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">{lang === "ru" ? "Депозит" : "Deposited"}</span>
              <span className="font-bold">${deposits.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t("lendRate")}</span>
              <span className="text-green-400 font-bold">{lendRate.toFixed(2)}% APY</span>
            </div>
            <div className="border-t border-gray-800 pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{lang === "ru" ? "В день" : "Daily"}</span>
                <span className="text-green-400">${dailyEarning.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{lang === "ru" ? "В месяц" : "Monthly"}</span>
                <span className="text-green-400">${monthlyEarning.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{lang === "ru" ? "В год" : "Yearly"}</span>
                <span className="text-green-400 font-bold">${yearlyEarning.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-orange-800/30 p-5">
          <h3 className="text-orange-400 text-sm font-medium mb-3">
            {lang === "ru" ? "Стоимость займа" : "Borrower Cost"}
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">{lang === "ru" ? "Займ" : "Borrowed"}</span>
              <span className="font-bold">${borrows.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t("borrowRate")}</span>
              <span className="text-orange-400 font-bold">{borrowRate.toFixed(2)}% APR</span>
            </div>
            <div className="border-t border-gray-800 pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{lang === "ru" ? "В день" : "Daily"}</span>
                <span className="text-orange-400">${dailyCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{lang === "ru" ? "В месяц" : "Monthly"}</span>
                <span className="text-orange-400">${monthlyCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">{borrowCount}</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Займов" : "Borrows"}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{repayCount}</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Возвратов" : "Repays"}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold text-cyan-400">{collateralCount}</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Залогов" : "Collaterals"}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold">{utilization.toFixed(1)}%</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Утилизация" : "Utilization"}</p>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          {lang === "ru" ? "Оборот протокола" : "Protocol Volume"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">{lang === "ru" ? "Всего занято" : "Total Borrowed"}</p>
            <p className="text-lg font-bold text-orange-400">${totalBorrowed.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{lang === "ru" ? "Всего возвращено" : "Total Repaid"}</p>
            <p className="text-lg font-bold text-blue-400">${totalRepaid.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{lang === "ru" ? "Активный долг" : "Active Debt"}</p>
            <p className="text-lg font-bold">${borrows.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Activity List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : !items.length ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          {t("noActivity")}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="divide-y divide-gray-800">
            {items.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/30">
                <div className="flex items-center gap-3">
                  <span className={`text-lg ${actionColors[a.action] ?? "text-gray-400"}`}>
                    {actionIcons[a.action] ?? "\u2022"}
                  </span>
                  <div>
                    <span className={`text-sm font-medium ${actionColors[a.action] ?? "text-gray-300"}`}>
                      {t(actionLabels[a.action] ?? "actDeposit")}
                    </span>
                    <span className="text-sm text-gray-400 ml-2">
                      {a.amount.toLocaleString()} {a.token}
                    </span>
                    <p className="text-xs text-gray-600">{a.user}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{new Date(a.timestamp).toLocaleString()}</p>
                  {a.pool_util_after > 0 && (
                    <p className="text-xs text-gray-600">util: {a.pool_util_after.toFixed(1)}%</p>
                  )}
                  {a.rate_at_time > 0 && (
                    <p className="text-xs text-gray-600">rate: {a.rate_at_time.toFixed(2)}%</p>
                  )}
                  {a.tx_signature && (
                    <a href={`https://solscan.io/tx/${a.tx_signature}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-purple-400 hover:underline">TX</a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="p-4 text-center border-t border-gray-800">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-50 transition"
              >
                {loadingMore ? "..." : t("loadMore")} ({total - items.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
