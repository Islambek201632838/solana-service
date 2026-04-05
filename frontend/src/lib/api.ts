const API_URL = import.meta.env.VITE_API_URL || "";
const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = import.meta.env.VITE_WS_URL || `${wsProto}//${window.location.host}/ws`;

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

export async function fetchActivity(limit = 20, offset = 0) {
  const res = await fetch(`${API_URL}/api/activity/?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Activity: ${res.status}`);
  return res.json();
}

export async function fetchSystemStatus() {
  const res = await fetch(`${API_URL}/api/system/status`);
  if (!res.ok) throw new Error(`System status: ${res.status}`);
  return res.json();
}

export async function fetchLeaderboard(type: "depositors" | "borrowers" | "keepers" = "depositors", limit = 10) {
  const res = await fetch(`${API_URL}/api/leaderboard/${type}?limit=${limit}`);
  if (!res.ok) throw new Error(`Leaderboard: ${res.status}`);
  return res.json();
}

export async function fetchSimulate(newRateBps: number, newCollateralBps: number) {
  const res = await fetch(`${API_URL}/api/ai/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_rate_bps: newRateBps, new_collateral_bps: newCollateralBps }),
  });
  if (!res.ok) throw new Error(`Simulate: ${res.status}`);
  return res.json();
}

export async function fetchRiskDashboard() {
  const res = await fetch(`${API_URL}/api/risk/dashboard`);
  if (!res.ok) throw new Error(`Risk dashboard: ${res.status}`);
  return res.json();
}

export async function fetchLiquidationQueue() {
  const res = await fetch(`${API_URL}/api/risk/liquidation-queue`);
  if (!res.ok) throw new Error(`Liquidation queue: ${res.status}`);
  return res.json();
}

export async function fetchCreditScore(wallet: string) {
  const res = await fetch(`${API_URL}/api/credit-score/${wallet}`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchModelStats() {
  const res = await fetch(`${API_URL}/api/ai/model-stats`);
  if (!res.ok) throw new Error(`Model stats: ${res.status}`);
  return res.json();
}

export async function fetchLiquidationPredict(wallet: string) {
  const res = await fetch(`${API_URL}/api/risk/predict/${wallet}`);
  if (!res.ok) return null;
  return res.json();
}
