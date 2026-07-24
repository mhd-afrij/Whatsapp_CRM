import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { MobileNavigation } from "./MobileNavigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopHeader />
        <main className="flex-1 p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <MobileNavigation />
    </div>
  );
}
