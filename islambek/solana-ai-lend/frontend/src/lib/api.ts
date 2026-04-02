const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

export { API_URL, WS_URL };

export async function fetchPoolState() {
  const res = await fetch(`${API_URL}/api/pool/state`);
  if (!res.ok) throw new Error(`Pool state: ${res.status}`);
  return res.json();
}

export async function fetchPoolStats() {
  const res = await fetch(`${API_URL}/api/pool/stats`);
  if (!res.ok) throw new Error(`Pool stats: ${res.status}`);
  return res.json();
}

export async function fetchDecisions(page = 1, limit = 10, riskLevel?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (riskLevel) params.set("risk_level", riskLevel);
  const res = await fetch(`${API_URL}/api/decisions/?${params}`);
  if (!res.ok) throw new Error(`Decisions: ${res.status}`);
  return res.json();
}

export async function fetchRateHistory(limit = 50) {
  const res = await fetch(`${API_URL}/api/analytics/rate-history?limit=${limit}`);
  if (!res.ok) throw new Error(`Rate history: ${res.status}`);
  return res.json();
}

export async function fetchRiskHistory(limit = 50) {
  const res = await fetch(`${API_URL}/api/analytics/risk-history?limit=${limit}`);
  if (!res.ok) throw new Error(`Risk history: ${res.status}`);
  return res.json();
}
