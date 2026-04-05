import { useLang } from "../../hooks/useLang";

interface Props {
  autoRateActive: boolean;
  dangerSlots: number;
  priceStale: boolean;
}

export default function SafetyNetBadge({ autoRateActive, dangerSlots, priceStale }: Props) {
  const { t } = useLang();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          autoRateActive
            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
            : "bg-green-500/20 text-green-400 border border-green-500/30"
        }`}
      >
        {autoRateActive ? t("autoRateActive") : t("autoRateInactive")}
      </span>
      {dangerSlots > 0 && (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
          {t("dangerSlots")}: {dangerSlots}
        </span>
      )}
      {priceStale && (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
          {t("priceStale")}
        </span>
      )}
    </div>
  );
}
