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
import HealthFactorBar from "./components/dashboard/HealthFactorBar";
import AnalyticsCharts from "./components/dashboard/AnalyticsCharts";
import LiquidationQueueWidget from "./components/dashboard/LiquidationQueueWidget";
import SafetyNetBadge from "./components/dashboard/SafetyNetBadge";
import InsuranceBadge from "./components/dashboard/InsuranceBadge";
import SolPriceWidget from "./components/dashboard/SolPriceWidget";
import LtvModeBadge from "./components/dashboard/LtvModeBadge";
import { usePool } from "./hooks/usePool";
import { useWebSocket } from "./hooks/useWebSocket";

import Activity from "./pages/Activity";
import AiDecisions from "./pages/AiDecisions";
import Deposit from "./pages/Deposit";
import Borrow from "./pages/Borrow";
import Leaderboard from "./pages/Leaderboard";
import Simulator from "./pages/Simulator";
import SystemStatus from "./pages/SystemStatus";

const endpoint = import.meta.env.VITE_SOLANA_RPC || clusterApiUrl("devnet");

function DashboardPage() {
  const { t } = useLang();
  const { stats, state, loading } = usePool();
  const { connected: wsConnected } = useWebSocket();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t("dashboardTitle")}</h2>
          <p className="text-sm text-gray-500">{t("dashboardSubtitle")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ProtocolMoodBadge mood={state?.current_mood ?? "Calm"} frozen={state?.is_frozen} />
          <SafetyNetBadge
            autoRateActive={stats?.auto_rate_active ?? false}
            dangerSlots={stats?.danger_slots ?? 0}
            priceStale={stats?.price_stale ?? false}
          />
          <LtvModeBadge
            collateralRatioPct={stats?.collateral_ratio_pct ?? 120}
            priceStale={stats?.price_stale ?? false}
          />
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} />
        </div>
      </div>

      <PoolStats stats={stats} loading={loading} />
      <HealthFactorBar
        healthFactor={stats?.pool_health_factor ?? 0}
        keeperRewardPct={stats?.keeper_reward_pct ?? 0}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SolPriceWidget
          price={stats?.sol_price_usd ?? 0}
          priceStale={stats?.price_stale ?? false}
          priceLastUpdated={stats?.price_last_updated ?? 0}
        />
        <InsuranceBadge
          insurancePct={stats?.insurance_fund_pct ?? 0}
          balanceUsd={stats?.insurance_balance_usd ?? 0}
          totalBorrowsUsd={stats?.total_borrows_usd ?? 0}
          badDebtCoveredUsd={stats?.total_bad_debt_covered_usd ?? 0}
        />
      </div>

      <AnalyticsCharts />
      <LiquidationQueueWidget />
    </div>
  );
}

function ActivePage({ tab }: { tab: string }) {
  switch (tab) {
    case "activity": return <Activity />;
    case "decisions": return <AiDecisions />;
    case "deposit": return <Deposit />;
    case "borrow": return <Borrow />;
    case "leaderboard": return <Leaderboard />;
    case "simulator": return <Simulator />;
    case "system": return <SystemStatus />;
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
