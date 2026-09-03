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
  conversationId,
}: {
  children: ReactNode;
  conversationId?: number | null;
}) {
  const pathname = usePathname();
  const isThreadOpen = /\/inbox\/[^/]+/.test(pathname ?? "");

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden border border-border bg-bg shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(500px,1fr)_330px]">
      <aside
        className={cn(
          "min-h-0 min-w-0 overflow-hidden border-r border-white/[0.08]",
          isThreadOpen ? "hidden md:block" : "block"
        )}
      >
        <ConversationSidebar />
      </aside>

      <section
        className={cn(
          "flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden",
          isThreadOpen ? "flex" : "hidden md:flex"
        )}
      >
        {children}
      </section>

      {conversationId && (
        <aside className="hidden h-full min-h-0 w-[330px] min-w-[330px] overflow-hidden border-l border-border bg-surface 2xl:block">
          <ContactContextPanel conversationId={conversationId} />
        </aside>
      )}
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
