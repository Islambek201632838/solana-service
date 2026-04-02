import { useState } from "react";
import Navbar from "./Navbar";
import BottomNav from "./BottomNav";
import MobileDrawer from "./MobileDrawer";

interface Props {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function AppLayout({ children, activeTab, onTabChange }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar onMenuToggle={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  );
}
