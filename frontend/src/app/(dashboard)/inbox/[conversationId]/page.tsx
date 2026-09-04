"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactContextPanel } from "@/components/inbox/contact-context-panel";
import { ContactContextDrawer } from "@/components/inbox/contact-context-drawer";

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const [panelOpen, setPanelOpen] = useState(false);
  const conversationId = Number(params?.conversationId);

  if (!conversationId || Number.isNaN(conversationId)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-danger">
        Invalid conversation.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden">
      {/* Main chat message thread */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ChatPanel conversationId={conversationId} onOpenContactInfo={() => setPanelOpen(true)} />
      </div>

      {/* Right-side docked contact details */}
      <aside className="hidden h-full min-h-0 w-[330px] 2xl:w-[360px] shrink-0 border-l border-border bg-surface overflow-y-auto xl:flex xl:flex-col">
        <ContactContextPanel conversationId={conversationId} />
      </aside>

      <ContactContextDrawer
        conversationId={conversationId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
      {panelOpen && (
        <div
          key="overlay"
          onClick={() => setPanelOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 xl:hidden"
          aria-hidden="true"
        />
      )}

      {panelOpen && (
        <div
          className="fixed inset-y-0 right-0 z-50 flex w-[min(90vw,340px)] max-w-full flex-col border-l border-border bg-surface shadow-2xl xl:hidden"
          aria-hidden={!panelOpen}
        >
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="absolute right-3 top-3 z-50 rounded-full p-2 text-muted hover:bg-primary-soft/60"
            aria-label="Close contact panel"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="h-full min-h-0 w-full overflow-y-auto">
            <ContactContextPanel conversationId={conversationId} />
          </div>
        </div>
      )}
    </div>
  );
}
