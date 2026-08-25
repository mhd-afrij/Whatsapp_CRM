"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationListPanel } from "@/components/inbox/conversation-list-panel";

/**
 * Minimal inbox shell: left list plus the active panel. The route decides what
 * the active panel is, but the shell keeps the layout readable and consistent.
 */
export function InboxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isThreadOpen = /\/inbox\/[^/]+/.test(pathname ?? "");

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-surface md:grid-cols-[clamp(280px,24vw,300px)_minmax(0,1fr)]">
      <div className={cn("min-h-0 min-w-0", isThreadOpen ? "hidden md:block" : "block")}>
        <ConversationListPanel />
      </div>
      <div className={cn("min-h-0 min-w-0 w-full", isThreadOpen ? "block" : "hidden md:block")}>
        {children}
      </div>
    </div>
  );
}
