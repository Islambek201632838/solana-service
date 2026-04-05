import { useLang } from "../../hooks/useLang";
import type { TranslationKey } from "../../lib/i18n";

interface Props {
  active: string;
  onChange: (tab: string) => void;
}

const tabs: { id: string; labelKey: TranslationKey; icon: string }[] = [
  { id: "dashboard", labelKey: "dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "decisions", labelKey: "aiDecisions", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "leaderboard", labelKey: "leaderboard", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  { id: "simulator", labelKey: "simulator", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
];

export default function BottomNav({ active, onChange }: Props) {
  const { t } = useLang();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 md:hidden">
      <div className="flex justify-around py-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center gap-1 px-3 py-1 min-h-[48px] ${
              active === tab.id ? "text-purple-400" : "text-gray-500"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
            </svg>
            <span className="text-xs">{t(tab.labelKey)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
