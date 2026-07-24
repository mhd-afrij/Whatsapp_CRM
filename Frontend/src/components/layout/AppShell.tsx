import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { MobileNavigation } from "./MobileNavigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#060b10] text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopHeader />
        <main className="flex-1 bg-[radial-gradient(circle_at_top,rgba(37,211,102,0.04),transparent_25%),linear-gradient(180deg,#0c1218_0%,#0a0f14_100%)] p-4 pb-24 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
