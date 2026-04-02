import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from "recharts";
import { fetchRateHistory, fetchRiskHistory } from "../lib/api";
import { useBreakpoint } from "../hooks/useMediaQuery";

export default function Analytics() {
  const [rateData, setRateData] = useState<any[]>([]);
  const [riskData, setRiskData] = useState<any[]>([]);
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    fetchRateHistory(50)
      .then((d) => setRateData(d.map((r: any) => ({
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        rate: r.new_rate / 100,
      }))))
      .catch(() => {});

    fetchRiskHistory(50)
      .then((d) => setRiskData(d.map((r: any) => ({
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        risk: r.risk_score,
        price: r.sol_price,
      }))))
      .catch(() => {});
  }, []);

  const chartHeight = isMobile ? 200 : 350;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics</h2>

      <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-2"} gap-6`}>
        {/* Rate chart */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Interest Rate</h3>
          {rateData.length ? (
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rateData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="rate" stroke="#a78bfa" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center text-gray-600" style={{ height: chartHeight }}>
              No rate data yet
            </div>
          )}
        </div>

        {/* Risk chart */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Risk Score</h3>
          {riskData.length ? (
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="risk" stroke="#f87171" fill="#f87171" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center text-gray-600" style={{ height: chartHeight }}>
              No risk data yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
