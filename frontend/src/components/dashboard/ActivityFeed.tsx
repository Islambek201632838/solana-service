import { useEffect, useState } from "react";
import { fetchActivity } from "../../lib/api";
import { useLang } from "../../hooks/useLang";
import type { TranslationKey } from "../../lib/i18n";

const actionLabels: Record<string, TranslationKey> = {
  deposit: "actDeposit",
  withdraw: "actDeposit",
  borrow: "actBorrow",
  repay: "actRepay",
  deposit_collateral: "actCollateral",
  withdraw_collateral: "actCollateral",
  liquidate: "actLiquidate",
};

const actionColors: Record<string, string> = {
  deposit: "text-green-400",
  borrow: "text-orange-400",
  repay: "text-blue-400",
  deposit_collateral: "text-cyan-400",
  withdraw_collateral: "text-yellow-400",
  liquidate: "text-red-400",
};

const actionIcons: Record<string, string> = {
  deposit: "+",
  borrow: "\u2193",
  repay: "\u2191",
  deposit_collateral: "\u26a1",
  withdraw_collateral: "\u21a9",
  liquidate: "\u26a0",
};

interface Activity {
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

export default function ActivityFeed() {
  const { t } = useLang();
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity(20).then(d => { setItems(d.items || []); setLoading(false); }).catch(() => setLoading(false));
    const interval = setInterval(() => {
      fetchActivity(20).then(d => setItems(d.items || [])).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse h-32" />;
  }

  if (!items.length) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500">
        {t("noActivity")}
      </div>
    );
  }

  return (
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
              {a.tx_signature && (
                <a
                  href={`https://solscan.io/tx/${a.tx_signature}?cluster=devnet`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:underline"
                >TX</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
