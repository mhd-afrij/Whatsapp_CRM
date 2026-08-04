"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationListPanel } from "@/components/inbox/conversation-list-panel";

/**
 * Inbox is a two-pane layout (conversation list + active thread) on desktop.
 * Below the `lg` breakpoint there isn't room for both panes side by side, so
 * we show only one at a time: the list on `/inbox`, and the thread once a
 * conversation is selected (`/inbox/[conversationId]`) - which also gives
 * mobile users a way back to the list (the back button in the thread header).
 */
export function InboxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isThreadOpen = /\/inbox\/[^/]+/.test(pathname ?? "");

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-[clamp(240px,26vw,360px)_minmax(0,1fr)]">
      <div className={cn("h-full min-w-0 lg:block", isThreadOpen ? "hidden" : "block")}>
        <ConversationListPanel />
      </div>
      <div className={cn("h-full min-w-0 lg:block", isThreadOpen ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}
