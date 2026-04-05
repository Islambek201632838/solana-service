import { useEffect, useState } from "react";
import { fetchSystemStatus } from "../lib/api";
import { useLang } from "../hooks/useLang";

interface Check {
  name: string;
  ok: boolean;
  scope: string;
}

export default function SystemStatus() {
  const { t } = useLang();
  const [checks, setChecks] = useState<Check[]>([]);
  const [devnetReady, setDevnetReady] = useState(false);
  const [mainnetRemaining, setMainnetRemaining] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSystemStatus()
      .then((d) => {
        setChecks(d.checks || []);
        setDevnetReady(d.devnet_ready);
        setMainnetRemaining(d.mainnet_remaining);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="animate-pulse bg-gray-900 rounded-xl h-48" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("prodReadiness")}</h2>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${devnetReady ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
            {t("devnetReady")}: {devnetReady ? "YES" : "NO"}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400">
            {t("mainnetRemaining")}: {mainnetRemaining}
          </span>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {checks.map((check, i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-gray-800/50" : ""}`}>
            <div className="flex items-center gap-3">
              <span className={check.ok ? "text-green-400" : "text-gray-600"}>
                {check.ok ? "\u2705" : "\u2B1C"}
              </span>
              <span className={`text-sm ${check.ok ? "text-gray-200" : "text-gray-500"}`}>{check.name}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${check.scope === "devnet" ? "bg-purple-500/10 text-purple-400" : "bg-gray-800 text-gray-500"}`}>
              {check.scope}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
