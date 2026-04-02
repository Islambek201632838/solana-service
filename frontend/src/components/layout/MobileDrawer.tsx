interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-gray-900 border-r border-gray-800 p-6">
        <h2 className="text-lg font-bold mb-6 text-purple-400">SolanaAI Lend</h2>
        <nav className="flex flex-col gap-4">
          <a href="#dashboard" onClick={onClose} className="text-gray-300 hover:text-white py-2">Dashboard</a>
          <a href="#decisions" onClick={onClose} className="text-gray-300 hover:text-white py-2">AI Decisions</a>
          <a href="#analytics" onClick={onClose} className="text-gray-300 hover:text-white py-2">Analytics</a>
        </nav>
        <div className="mt-8 pt-4 border-t border-gray-800 text-xs text-gray-600">
          Devnet Only
        </div>
      </div>
    </>
  );
}
