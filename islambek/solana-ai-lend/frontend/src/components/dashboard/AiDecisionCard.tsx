interface Decision {
  id: number;
  timestamp: string;
  old_rate: number;
  new_rate: number;
  reasoning: string;
  confidence: number;
  risk_level: string;
  tx_signature?: string;
}

const riskColors: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

export default function AiDecisionCard({ decision }: { decision: Decision }) {
  const rateChange = decision.new_rate - decision.old_rate;
  const arrow = rateChange > 0 ? "+" : "";

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">
          {new Date(decision.timestamp).toLocaleString()}
        </span>
        <span className={`text-xs font-medium ${riskColors[decision.risk_level] ?? "text-gray-400"}`}>
          {decision.risk_level}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold">
          {(decision.new_rate / 100).toFixed(2)}%
        </span>
        <span className={`text-sm ${rateChange >= 0 ? "text-green-400" : "text-red-400"}`}>
          {arrow}{(rateChange / 100).toFixed(2)}%
        </span>
        <span className="text-xs text-gray-600">confidence: {decision.confidence}%</span>
      </div>

      <p className="text-sm text-gray-400 line-clamp-2">{decision.reasoning}</p>

      {decision.tx_signature && (
        <a
          href={`https://solscan.io/tx/${decision.tx_signature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:underline mt-2 block"
        >
          View TX
        </a>
      )}
    </div>
  );
}
