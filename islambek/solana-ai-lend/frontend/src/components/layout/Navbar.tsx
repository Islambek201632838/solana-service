import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useBreakpoint } from "../../hooks/useMediaQuery";

interface Props {
  onMenuToggle: () => void;
}

export default function Navbar({ onMenuToggle }: Props) {
  const { isMobile } = useBreakpoint();

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
          <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            SolanaAI Lend
          </h1>
        </div>

        {!isMobile && (
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="#dashboard" className="hover:text-white">Dashboard</a>
            <a href="#decisions" className="hover:text-white">AI Decisions</a>
            <a href="#analytics" className="hover:text-white">Analytics</a>
          </div>
        )}

        <WalletMultiButton className="!bg-purple-600 !rounded-lg !h-10 !text-sm" />
      </div>
    </nav>
  );
}
