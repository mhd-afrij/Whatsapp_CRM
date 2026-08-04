"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactContextPanel } from "@/components/inbox/contact-context-panel";
import { X, Menu } from "lucide-react";

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
    <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden xl:grid xl:grid-cols-[minmax(0,1fr)_clamp(280px,24vw,380px)]">
      <ChatPanel conversationId={conversationId} />

      {/* Mobile drawer toggle */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="absolute right-2 top-2 z-40 rounded-full p-2 text-muted hover:bg-primary-soft/60 lg:hidden"
        aria-label="Open contact info"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer overlay */}
      {panelOpen && (
        <div
          key="overlay"
          onClick={() => setPanelOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={`
          fixed inset-y-0 right-0 z-40 flex w-[320px] max-w-full translate-x-full
          transform items-stretch transition-transform duration-200 ease-out
          ${panelOpen ? "translate-x-0" : "translate-x-full"}
          lg:static lg:translate-x-0 lg:flex lg:flex-col
        `}
      >
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="absolute top-2 right-2 z-50 rounded-full p-2 text-muted hover:bg-primary-soft/60 lg:hidden"
          aria-label="Close contact panel"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-full min-w-0">
          <ContactContextPanel conversationId={conversationId} />
        </div>
      </div>
    </div>
  );
}
