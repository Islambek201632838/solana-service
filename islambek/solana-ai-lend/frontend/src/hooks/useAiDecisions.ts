import { useState, useEffect } from "react";
import { fetchDecisions } from "../lib/api";

export function useAiDecisions(page = 1, limit = 10, riskLevel?: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchDecisions(page, limit, riskLevel)
      .then((d) => { if (mounted) setData(d); })
      .catch(() => { if (mounted) setData(null); })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [page, limit, riskLevel]);

  return { data, loading };
}
