"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topnav } from "@/components/layout/topnav";
import { AuthGuard } from "@/components/auth/auth-guard";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar-context";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isInbox = pathname?.startsWith("/inbox");

  return (
    <AuthGuard>
      <MobileSidebarProvider>
        <div className="flex h-full w-full overflow-hidden bg-bg">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Topnav />
            <main
              className={cn(
                "min-h-0 min-w-0 flex-1 overflow-x-hidden",
                isInbox ? "h-full w-full overflow-hidden p-0" : "overflow-y-auto p-4 sm:p-5"
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </MobileSidebarProvider>
    </AuthGuard>
  );
}
