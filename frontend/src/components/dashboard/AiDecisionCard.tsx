import { useLang } from "../../hooks/useLang";
import type { TranslationKey } from "../../lib/i18n";

const riskLabelKeys: Record<string, TranslationKey> = {
  low: "riskLow",
  medium: "riskMedium",
  high: "riskHigh",
  critical: "riskCritical",
};

interface Decision {
  id: number;
  timestamp: string;
  old_rate: number;
  new_rate: number;
  reasoning: string;
  reasoning_en?: string;
  reasoning_ru?: string;
  confidence: number;
  risk_level: string;
  risk_score?: number;
  tx_signature?: string;
  // ML metrics
  rsi?: number;
  macd_trend?: string;
  trend_direction?: string;
  trend_proba_up?: number;
  trend_proba_down?: number;
  volatility_regime?: string;
  anomaly_detected?: boolean;
  feature_importance?: Record<string, number>;
  sol_price_source?: string;
  price_updated_onchain?: boolean;
  sentiment_score?: number;
  sentiment_severity?: string;
  sentiment_summary_en?: string;
  sentiment_summary_ru?: string;
}

const riskColors: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

const trendIcons: Record<string, string> = {
  up: "\u2191",
  down: "\u2193",
  sideways: "\u2194",
  hold: "\u2022",
};

const trendLabelKeys: Record<string, TranslationKey> = {
  up: "mlTrendUp",
  down: "mlTrendDown",
  sideways: "mlTrendSideways",
  hold: "mlTrendHold",
};

const volLabelKeys: Record<string, TranslationKey> = {
  low: "mlVolLow",
  medium: "mlVolMedium",
  high: "mlVolHigh",
  unknown: "mlVolUnknown",
};

const sentimentLabelKeys: Record<string, TranslationKey> = {
  noise: "sentimentNoise",
  notable: "sentimentNotable",
  serious: "sentimentSerious",
  critical: "sentimentCritical",
};

const sentimentColors: Record<string, string> = {
  noise: "text-gray-500",
  notable: "text-blue-400",
  serious: "text-orange-400",
  critical: "text-red-400",
};

export default function AiDecisionCard({ decision, expanded = false }: { decision: Decision; expanded?: boolean }) {
  const { lang, t } = useLang();
  const rateChange = decision.new_rate - decision.old_rate;
  const arrow = rateChange > 0 ? "+" : "";

  const reasoning = lang === "ru"
    ? (decision.reasoning_ru || decision.reasoning_en || decision.reasoning)
    : (decision.reasoning_en || decision.reasoning);

  const hasML = decision.rsi && decision.rsi > 0;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">
          {new Date(decision.timestamp).toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          {decision.anomaly_detected && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{t("mlAnomaly")}</span>
          )}
          <span className={`text-xs font-medium ${riskColors[decision.risk_level] ?? "text-gray-400"}`}>
            {t(riskLabelKeys[decision.risk_level] ?? "riskMedium")}
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold">
          {(decision.new_rate / 100).toFixed(2)}%
        </span>
        <span className={`text-sm ${rateChange >= 0 ? "text-green-400" : "text-red-400"}`}>
          {arrow}{(rateChange / 100).toFixed(2)}%
        </span>
        <span className="text-xs text-gray-600">{t("confidence")}: {decision.confidence}%</span>
      </div>

      {/* ML Indicators Row */}
      {hasML && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
            RSI {decision.rsi?.toFixed(0)}
          </span>
          {decision.macd_trend && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
              MACD {decision.macd_trend}
            </span>
          )}
          {decision.trend_direction && (
            <span className={`text-xs px-1.5 py-0.5 rounded bg-gray-800 ${
              decision.trend_direction === "up" ? "text-green-400" :
              decision.trend_direction === "down" ? "text-red-400" : "text-gray-400"
            }`}>
              {trendIcons[decision.trend_direction] || ""} {t(trendLabelKeys[decision.trend_direction] ?? "mlTrendHold")}
              {decision.trend_proba_up ? ` (${(decision.trend_proba_up * 100).toFixed(0)}%)` : ""}
            </span>
          )}
          {decision.volatility_regime && (
            <span className={`text-xs px-1.5 py-0.5 rounded bg-gray-800 ${
              decision.volatility_regime === "high" ? "text-orange-400" : "text-gray-400"
            }`}>
              {t(volLabelKeys[decision.volatility_regime] ?? "mlVolUnknown")}
            </span>
          )}
          {decision.price_updated_onchain && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
              {t("mlPriceOnchain")}
            </span>
          )}
        </div>
      )}

      {/* Sentiment Row */}
      {decision.sentiment_severity && decision.sentiment_severity !== "noise" && (
        <div className={`text-xs mb-2 px-2 py-1 rounded bg-gray-800 ${sentimentColors[decision.sentiment_severity] ?? "text-gray-500"}`}>
          {t(sentimentLabelKeys[decision.sentiment_severity] ?? "sentimentNoise")}
          {decision.sentiment_score ? ` (${decision.sentiment_score > 0 ? "+" : ""}${decision.sentiment_score.toFixed(1)})` : ""}
          {" — "}
          {lang === "ru" ? (decision.sentiment_summary_ru || decision.sentiment_summary_en) : decision.sentiment_summary_en}
        </div>
      )}

      <p className="text-sm text-gray-400 line-clamp-2">{reasoning}</p>

      {/* Feature Importance (expanded view) */}
      {expanded && decision.feature_importance && Object.keys(decision.feature_importance).length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-1">{t("mlFeatures")}:</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(decision.feature_importance)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([name, value]) => (
                <span key={name} className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  {name}: {(value * 100).toFixed(0)}%
                </span>
              ))}
          </div>
        </div>
      )}

      {decision.tx_signature && (
        <a
          href={`https://solscan.io/tx/${decision.tx_signature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-400 hover:underline mt-2 block"
        >
          {t("viewTx")}
        </a>
      )}
    </div>
  );
}
