import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { fetchRateHistory } from "../../lib/api";

export default function RateChart() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetchRateHistory(30)
      .then((d) => setData(d.map((r: any) => ({
        time: new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        rate: r.new_rate / 100,
        confidence: r.confidence,
      }))))
      .catch(() => setData([]));
  }, []);

  if (data.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Interest Rate History</h3>
        <div className="h-[200px] sm:h-[250px] lg:h-[350px] flex items-center justify-center text-gray-600">
          No rate history yet — AI agent needs to run
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Interest Rate History</h3>
      <div className="h-[200px] sm:h-[250px] lg:h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} unit="%" />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
              labelStyle={{ color: "#9ca3af" }}
            />
            <Line type="monotone" dataKey="rate" stroke="#a78bfa" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
