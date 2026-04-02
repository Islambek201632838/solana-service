import { useState, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

import { LangContext } from "./hooks/useLang";
import { useLang } from "./hooks/useLang";
import type { Lang } from "./lib/i18n";

import AppLayout from "./components/layout/AppLayout";
import PoolStats from "./components/dashboard/PoolStats";
import ProtocolMoodBadge from "./components/dashboard/ProtocolMoodBadge";
import RateChart from "./components/dashboard/RateChart";
import AiDecisionCard from "./components/dashboard/AiDecisionCard";
import { usePool } from "./hooks/usePool";
import { useAiDecisions } from "./hooks/useAiDecisions";
import { useWebSocket } from "./hooks/useWebSocket";

import Deposit from "./pages/Deposit";
import Borrow from "./pages/Borrow";
import AiDecisions from "./pages/AiDecisions";
import Analytics from "./pages/Analytics";

const endpoint = import.meta.env.VITE_SOLANA_RPC || clusterApiUrl("devnet");

function DashboardPage() {
  const { t } = useLang();
  const { stats, state, loading } = usePool();
  const { data: decisions } = useAiDecisions(1, 5);
  const { connected: wsConnected } = useWebSocket();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t("dashboardTitle")}</h2>
          <p className="text-sm text-gray-500">{t("dashboardSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <ProtocolMoodBadge mood={state?.current_mood ?? "Calm"} frozen={state?.is_frozen} />
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} />
        </div>
      </div>

      <PoolStats stats={stats} loading={loading} />
      <RateChart />

      <div>
        <h3 className="text-lg font-semibold mb-3">{t("recentAiDecisions")}</h3>
        {decisions?.items?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {decisions.items.map((d: any) => (
              <AiDecisionCard key={d.id} decision={d} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500">
            {t("noAiDecisions")}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivePage({ tab }: { tab: string }) {
  switch (tab) {
    case "deposit": return <Deposit />;
    case "borrow": return <Borrow />;
    case "decisions": return <AiDecisions />;
    case "analytics": return <Analytics />;
    default: return <DashboardPage />;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("lang");
    return (saved === "ru" || saved === "en") ? saved : "en";
  });
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  const handleSetLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("lang", l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang: handleSetLang }}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
              <ActivePage tab={activeTab} />
            </AppLayout>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </LangContext.Provider>
  );
}
