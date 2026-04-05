import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../lib/api";
import { useLang } from "../hooks/useLang";

type Tab = "depositors" | "borrowers" | "keepers";

interface Entry {
  rank: number;
  user: string;
  amount: number;
  operations: number;
  action_type: string;
}

export default function Leaderboard() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("depositors");
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(tab, 20)
      .then((d) => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "depositors", label: t("topDepositors") },
    { id: "borrowers", label: t("topBorrowers") },
    { id: "keepers", label: t("topKeepers") },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t("leaderboard")}</h2>

      <div className="flex gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === tb.id
                ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 animate-pulse">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="px-4 py-3 text-left">{t("rankCol")}</th>
                <th className="px-4 py-3 text-left">{t("addressCol")}</th>
                <th className="px-4 py-3 text-right">{t("amountCol")}</th>
                <th className="px-4 py-3 text-right">{t("opsCol")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.rank} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400">
                    {entry.rank <= 3 ? (
                      <span className={entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-gray-300" : "text-orange-400"}>
                        {entry.rank === 1 ? "\u{1F947}" : entry.rank === 2 ? "\u{1F948}" : "\u{1F949}"}
                      </span>
                    ) : entry.rank}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {entry.user.slice(0, 4)}...{entry.user.slice(-4)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {entry.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className="text-gray-500 ml-1 text-xs">
                      {tab === "keepers" ? "aiUSDC" : tab === "depositors" ? "aiUSDC" : "aiUSDC"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{entry.operations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
