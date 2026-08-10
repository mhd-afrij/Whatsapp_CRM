"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactContextPanel } from "@/components/inbox/contact-context-panel";

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const [panelOpen, setPanelOpen] = useState(false);
  const conversationId = Number(params.conversationId);

  if (!conversationId || Number.isNaN(conversationId)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-danger">
        Invalid conversation.
      </div>
    );
  }

  return (
    <div className="relative grid h-full min-h-0 min-w-0 overflow-hidden grid-cols-1 xl:grid-cols-[minmax(0,1fr)_clamp(300px,22vw,330px)]">
      <ChatPanel conversationId={conversationId} onOpenContactInfo={() => setPanelOpen(true)} />

      <div className="hidden xl:block min-h-0 min-w-0">
        <ContactContextPanel conversationId={conversationId} />
      </div>

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
          className="fixed inset-y-0 right-0 z-50 flex w-[min(90vw,330px)] max-w-full xl:hidden"
          aria-hidden={!panelOpen}
        >
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="absolute right-2 top-2 z-50 rounded-full p-2 text-muted hover:bg-primary-soft/60"
            aria-label="Close contact panel"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="h-full min-w-0 w-full">
            <ContactContextPanel conversationId={conversationId} />
          </div>
        </div>
      )}
    </div>
  );
}
