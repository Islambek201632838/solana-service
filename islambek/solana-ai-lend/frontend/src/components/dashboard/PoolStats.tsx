interface Props {
  stats: any;
  loading: boolean;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function PoolStats({ stats, loading }: Props) {
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
        Pool not connected — deploy to devnet first
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Total Deposits"
        value={`$${stats.total_deposits_usd?.toLocaleString() ?? "0"}`}
        sub={`${stats.utilization_pct?.toFixed(1) ?? 0}% utilization`}
      />
      <StatCard
        label="Interest Rate"
        value={`${stats.interest_rate_pct?.toFixed(2) ?? 0}%`}
        sub={`Collateral: ${stats.collateral_ratio_pct?.toFixed(0) ?? 0}%`}
      />
      <StatCard
        label="Total Borrows"
        value={`$${stats.total_borrows_usd?.toLocaleString() ?? "0"}`}
        sub={`Liquidity: $${stats.available_liquidity_usd?.toLocaleString() ?? "0"}`}
      />
      <StatCard
        label="AI Updates"
        value={String(stats.total_ai_updates ?? 0)}
        sub={`${stats.total_liquidations ?? 0} liquidations`}
      />
    </div>
  );
}
