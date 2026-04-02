import { useState, useEffect } from "react";
import { fetchPoolState, fetchPoolStats } from "../lib/api";

export function usePool(refreshInterval = 30000) {
  const [state, setState] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [s, st] = await Promise.allSettled([
          fetchPoolState(),
          fetchPoolStats(),
        ]);

        if (!mounted) return;

        const poolState = s.status === "fulfilled" ? s.value : null;
        const poolStats = st.status === "fulfilled" ? st.value : null;

        setState(poolState);
        setStats(poolStats);

        if (!poolState && !poolStats) {
          setError("Pool not available");
        } else {
          setError(null);
        }
      } catch (e: any) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, refreshInterval);
    return () => { mounted = false; clearInterval(id); };
  }, [refreshInterval]);

  return { state, stats, loading, error };
}
