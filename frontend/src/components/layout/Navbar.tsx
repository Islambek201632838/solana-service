import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useBreakpoint } from "../../hooks/useMediaQuery";
import { useLang } from "../../hooks/useLang";
import type { TranslationKey } from "../../lib/i18n";

interface Props {
  onMenuToggle: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs: { id: string; labelKey: TranslationKey }[] = [
  { id: "dashboard", labelKey: "dashboard" },
  { id: "deposit", labelKey: "deposit" },
  { id: "borrow", labelKey: "borrow" },
  { id: "decisions", labelKey: "aiDecisions" },
  { id: "analytics", labelKey: "analytics" },
];

export default function Navbar({ onMenuToggle, activeTab, onTabChange }: Props) {
  const { isMobile } = useBreakpoint();
  const { lang, setLang, t } = useLang();
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const walletLabel = publicKey
    ? publicKey.toBase58().slice(0, 4) + "..." + publicKey.toBase58().slice(-4)
    : t("selectWallet");

  return (
    <nav className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button onClick={onMenuToggle} className="p-2 text-gray-400 hover:text-white" aria-label="Menu">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <h1
            className="text-lg font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent cursor-pointer"
            onClick={() => onTabChange("dashboard")}
          >
            SolanaAI Lend
          </h1>
        </div>

        {!isMobile && (
          <div className="flex gap-1 text-sm">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  activeTab === tab.id
                    ? "bg-purple-600/20 text-purple-400"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "ru" : "en")}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            {lang === "en" ? "EN" : "RU"}
          </button>
          <button
            onClick={() => publicKey ? disconnect() : setVisible(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg h-10 px-4 text-sm transition"
          >
            {walletLabel}
          </button>
        </div>
      </div>
    </nav>
  );
}
