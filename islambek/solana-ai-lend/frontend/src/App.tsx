import { useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

import AppLayout from "./components/layout/AppLayout";
import PoolStats from "./components/dashboard/PoolStats";
import ProtocolMoodBadge from "./components/dashboard/ProtocolMoodBadge";
import RateChart from "./components/dashboard/RateChart";
import AiDecisionCard from "./components/dashboard/AiDecisionCard";
import { usePool } from "./hooks/usePool";
import { useAiDecisions } from "./hooks/useAiDecisions";
import { useWebSocket } from "./hooks/useWebSocket";

const endpoint = import.meta.env.VITE_SOLANA_RPC || clusterApiUrl("devnet");
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

function Dashboard() {
  const { stats, state, loading } = usePool();
  const { data: decisions } = useAiDecisions(1, 5);
  const { connected: wsConnected } = useWebSocket();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-gray-500">AI-powered lending on Solana Devnet</p>
        </div>
        <div className="flex items-center gap-3">
          <ProtocolMoodBadge
            mood={state?.current_mood ?? "Calm"}
            frozen={state?.is_frozen}
          />
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} />
        </div>
      </div>

      {/* Stats Grid */}
      <PoolStats stats={stats} loading={loading} />

      {/* Chart */}
      <RateChart />

      {/* Recent AI Decisions */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Recent AI Decisions</h3>
        {decisions?.items?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {decisions.items.map((d: any) => (
              <AiDecisionCard key={d.id} decision={d} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center text-gray-500">
            No AI decisions yet — start the AI agent
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
            <Dashboard />
          </AppLayout>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
