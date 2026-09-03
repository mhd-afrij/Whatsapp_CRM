"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Wraps dashboard main content. On full-screen app routes (inbox) it removes
 *  padding and scroll so the page can span edge-to-edge at 100vh. */
export function DashboardMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullScreen = (pathname ?? "").startsWith("/inbox");

  return (
    <main
      className={cn(
        "min-h-0 flex-1 bg-bg",
        isFullScreen ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden p-4 sm:p-6"
      )}
    >
      {children}
    </main>
  );
}
