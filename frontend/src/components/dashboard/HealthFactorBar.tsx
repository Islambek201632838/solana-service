import { useLang } from "../../hooks/useLang";

interface Props {
  healthFactor: number;
  keeperRewardPct: number;
}

export default function HealthFactorBar({ healthFactor, keeperRewardPct }: Props) {
  const { t } = useLang();

  // health > 1.5 = green, 1.0-1.5 = yellow, < 1.0 = red
  const capped = Math.min(healthFactor, 3);
  const pct = Math.min((capped / 3) * 100, 100);

  let color = "bg-green-500";
  let textColor = "text-green-400";
  let label = t("healthHealthy");

  if (healthFactor < 1.0) {
    color = "bg-red-500";
    textColor = "text-red-400";
    label = t("healthDanger");
  } else if (healthFactor < 1.5) {
    color = "bg-yellow-500";
    textColor = "text-yellow-400";
    label = t("healthWarning");
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{t("healthFactor")}</p>
        <span className={`text-sm font-bold ${textColor}`}>
          {healthFactor >= 99 ? "\u221e" : healthFactor.toFixed(2)}
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2.5">
        <div
          className={`${color} h-2.5 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${textColor}`}>{label}</span>
        {keeperRewardPct > 0 && (
          <span className="text-xs text-gray-500">
            {t("keeperReward")}: {keeperRewardPct}%
          </span>
        )}
      </div>
    </div>
  );
}
