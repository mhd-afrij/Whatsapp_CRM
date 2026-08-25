import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topnav } from "@/components/layout/topnav";
import { AuthGuard } from "@/components/auth/auth-guard";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar-context";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <MobileSidebarProvider>
        <div className="flex h-dvh overflow-hidden bg-bg">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Topnav />
            <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </MobileSidebarProvider>
    </AuthGuard>
  );
}
