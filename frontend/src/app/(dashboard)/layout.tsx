"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topnav } from "@/components/layout/topnav";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/context/auth-context";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar-context";
import { cn } from "@/lib/utils";

function OnboardingGate() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user && user.onboarding_step && user.onboarding_step !== "completed") {
      router.replace("/onboarding");
    }
  }, [isLoading, user, router, pathname]);

  return null;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isInbox = pathname?.startsWith("/inbox");

  return (
    <AuthGuard>
      <OnboardingGate />
      <MobileSidebarProvider>
        <div className="flex h-full w-full overflow-hidden bg-bg">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Topnav />
            <main
              className={cn(
                "ambient-dash min-h-0 min-w-0 flex-1 overflow-x-hidden",
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
