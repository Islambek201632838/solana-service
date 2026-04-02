interface Props {
  open: boolean;
  onClose: () => void;
  onTabChange?: (tab: string) => void;
}

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "deposit", label: "Deposit" },
  { id: "borrow", label: "Borrow" },
  { id: "decisions", label: "AI Decisions" },
  { id: "analytics", label: "Analytics" },
];

export default function MobileDrawer({ open, onClose, onTabChange }: Props) {
  if (!open) return null;

  const handleClick = (id: string) => {
    onTabChange?.(id);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-gray-900 border-r border-gray-800 p-6">
        <h2 className="text-lg font-bold mb-6 text-purple-400">SolanaAI Lend</h2>
        <nav className="flex flex-col gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleClick(tab.id)}
              className="text-left text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-gray-800"
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="mt-8 pt-4 border-t border-gray-800 text-xs text-gray-600">
          Devnet Only
        </div>
      </div>
    </>
  );
}
