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

type Filter = "all" | "borrow" | "repay" | "deposit_collateral";

const PAGE_SIZE = 10;

export default function Activity() {
  const { t, lang } = useLang();
  const { stats } = usePool();
  const [allItems, setAllItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchActivity(500, 0)
      .then(d => { setAllItems(d.items || []); setTotal(d.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Filter items
  const filtered = filter === "all" ? allItems : allItems.filter(i => i.action === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filter changes
  const changeFilter = (f: Filter) => { setFilter(f); setPage(1); };

  // Stats
  const borrowCount = allItems.filter(i => i.action === "borrow").length;
  const repayCount = allItems.filter(i => i.action === "repay").length;
  const collateralCount = allItems.filter(i => i.action === "deposit_collateral").length;
  const totalBorrowed = allItems.filter(i => i.action === "borrow").reduce((s, i) => s + i.amount, 0);
  const totalRepaid = allItems.filter(i => i.action === "repay").reduce((s, i) => s + i.amount, 0);

  const filters: { key: Filter; label: string; count: number; color: string }[] = [
    { key: "all", label: lang === "ru" ? "Все" : "All", count: allItems.length, color: "text-white" },
    { key: "borrow", label: lang === "ru" ? "Займы" : "Borrows", count: borrowCount, color: "text-orange-400" },
    { key: "repay", label: lang === "ru" ? "Возвраты" : "Repays", count: repayCount, color: "text-blue-400" },
    { key: "deposit_collateral", label: lang === "ru" ? "Залоги" : "Collateral", count: collateralCount, color: "text-cyan-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("recentActivity")}</h2>
        <span className="text-sm text-gray-500">{filtered.length} / {total}</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => changeFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              filter === f.key
                ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
                : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
            }`}
          >
            <span className={filter === f.key ? "" : f.color}>{f.label}</span>
            <span className="ml-1.5 text-xs text-gray-500">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
          <p className="text-xl font-bold text-orange-400">${totalBorrowed.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Всего занято" : "Total Borrowed"}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
          <p className="text-xl font-bold text-blue-400">${totalRepaid.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Всего возвращено" : "Total Repaid"}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
          <p className="text-xl font-bold">${(stats?.total_borrows_usd ?? 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Активный долг" : "Active Debt"}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
          <p className="text-xl font-bold">{(stats?.utilization_pct ?? 0).toFixed(1)}%</p>
          <p className="text-xs text-gray-500">{lang === "ru" ? "Утилизация" : "Utilization"}</p>
        </div>
      </div>

      {/* Activity List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : !pageItems.length ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-500">
          {t("noActivity")}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="divide-y divide-gray-800">
            {pageItems.map((a) => (
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
                  {a.tx_signature && a.tx_signature !== "setup" && (
                    <a href={`https://solscan.io/tx/${a.tx_signature}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-purple-400 hover:underline">TX</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-400 disabled:opacity-30 hover:bg-gray-700"
          >
            &laquo;
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm transition ${
                  page === p ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-400 disabled:opacity-30 hover:bg-gray-700"
          >
            &raquo;
          </button>
        </div>
      )}
    </div>
  );
}
