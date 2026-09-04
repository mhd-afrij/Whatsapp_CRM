"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationListPanel } from "@/components/inbox/conversation-list-panel";
import { ContactContextPanel } from "@/components/inbox/contact-context-panel";

export function ConversationSidebar() {
  return <ConversationListPanel />;
}

/**
 * Three-pane inbox shell. The customer profile sticks to the right side on wide
 * screens and collapses into a slide-over drawer on smaller viewports.
 */
export function InboxLayout({
  children,
}: {
  children: ReactNode;
  conversationId?: number | null;
}) {
  const pathname = usePathname();
  const isThreadOpen = /\/inbox\/[^/]+/.test(pathname ?? "");

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg">
      <aside
        className={cn(
          "h-full min-h-0 shrink-0 border-r border-border bg-surface transition-all duration-200",
          "w-full md:w-[320px] lg:w-[340px] xl:w-[360px]",
          isThreadOpen ? "hidden md:flex flex-col" : "flex flex-col"
        )}
      >
        <ConversationSidebar />
      </aside>

      <section
        className={cn(
          "h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg",
          isThreadOpen ? "flex" : "hidden md:flex"
        )}
      >
        {children}
      </section>
    </div>
  );
}

/** Backwards-compatible export used by the existing inbox route. */
export function InboxShell({
  children,
  conversationId,
}: {
  children: ReactNode;
  conversationId?: number | null;
}) {
  return <InboxLayout conversationId={conversationId}>{children}</InboxLayout>;
}
