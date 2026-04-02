const moodConfig: Record<string, { color: string; bg: string }> = {
  Thriving: { color: "text-green-400", bg: "bg-green-400/10" },
  Calm: { color: "text-blue-400", bg: "bg-blue-400/10" },
  Cautious: { color: "text-yellow-400", bg: "bg-yellow-400/10" },
  Defensive: { color: "text-orange-400", bg: "bg-orange-400/10" },
  Emergency: { color: "text-red-400", bg: "bg-red-400/10" },
};

interface Props {
  mood: string;
  frozen?: boolean;
}

export default function ProtocolMoodBadge({ mood, frozen }: Props) {
  const cfg = moodConfig[mood] ?? moodConfig.Calm;

  return (
    <div className="flex items-center gap-2">
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
        {mood}
      </span>
      {frozen && (
        <span className="px-3 py-1 rounded-full text-xs font-medium text-red-400 bg-red-400/10">
          FROZEN
        </span>
      )}
    </div>
  );
}
