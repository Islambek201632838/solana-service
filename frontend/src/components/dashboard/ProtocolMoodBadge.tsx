import { useLang } from "../../hooks/useLang";
import type { TranslationKey } from "../../lib/i18n";

const moodConfig: Record<string, { color: string; bg: string; labelKey: TranslationKey }> = {
  Thriving: { color: "text-green-400", bg: "bg-green-400/10", labelKey: "moodThriving" },
  Calm: { color: "text-blue-400", bg: "bg-blue-400/10", labelKey: "moodCalm" },
  Cautious: { color: "text-yellow-400", bg: "bg-yellow-400/10", labelKey: "moodCautious" },
  Defensive: { color: "text-orange-400", bg: "bg-orange-400/10", labelKey: "moodDefensive" },
  Emergency: { color: "text-red-400", bg: "bg-red-400/10", labelKey: "moodEmergency" },
};

interface Props {
  mood: string;
  frozen?: boolean;
}

export default function ProtocolMoodBadge({ mood, frozen }: Props) {
  const cfg = moodConfig[mood] ?? moodConfig.Calm;
  const { t } = useLang();

  return (
    <div className="flex items-center gap-2">
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
        {t(cfg.labelKey)}
      </span>
      {frozen && (
        <span className="px-3 py-1 rounded-full text-xs font-medium text-red-400 bg-red-400/10">
          {t("frozen")}
        </span>
      )}
    </div>
  );
}
