"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ChatPanel } from "@/components/inbox/chat-panel";
import { ContactContextPanel } from "@/components/inbox/contact-context-panel";
import { ContactContextDrawer } from "@/components/inbox/contact-context-drawer";

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

      <ContactContextDrawer
        conversationId={conversationId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
