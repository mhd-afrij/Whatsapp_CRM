import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { authFetch } from "../../store/index.js";

export default function InboxPage({ title }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState("");

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => authFetch("/conversations"),
    refetchInterval: 20000,
  });

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: () => authFetch(`/conversations/${selectedId}/messages`),
    enabled: selectedId !== null,
  });

  const sendMessage = useMutation({
    mutationFn: ({ id, text }) => authFetch(`/conversations/${id}/messages`, { method: "POST", body: { body: text } }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setDraft("");
    },
  });

  function handleSend() {
    if (!selectedId || !draft.trim()) return;
    sendMessage.mutate({ id: selectedId, text: draft.trim() });
  }

  const conversations = conversationsQuery.data ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="w-full sm:w-[320px] shrink-0 border-r border-border-muted flex flex-col">
        <div className="p-3 border-b border-border-muted">
          <h2 className="text-sm font-medium text-text-primary">{title || "Inbox"}</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-4 text-sm text-text-muted">No conversations yet.</div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left flex gap-3 px-3 py-3 border-b border-border-muted hover:bg-surface-hover transition-colors ${selectedId === c.id ? "bg-surface-hover" : ""}`}
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
                {(c.contact_name ?? c.contact_phone).slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{c.contact_name ?? c.contact_phone}</p>
                <p className="text-xs text-text-secondary truncate mt-0.5">{c.contact_phone}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="hidden sm:flex flex-1 flex-col min-w-0">
        {selected ? (
          <>
            <div className="h-16 border-b border-border-muted flex items-center px-4 shrink-0">
              <p className="text-sm font-medium text-text-primary">{selected.contact_name ?? selected.contact_phone}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(messagesQuery.data ?? []).map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-[10px] px-3 py-2 text-sm ${m.direction === "out" ? "bg-primary-soft text-text-primary" : "bg-surface border border-border text-text-primary"}`}>
                    <p>{m.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border-muted p-3 shrink-0">
              <div className="flex items-end gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                  disabled={sendMessage.isPending}
                />
                <button onClick={handleSend} className="rounded-md bg-primary text-primary-foreground p-1.5 disabled:opacity-50" disabled={!draft.trim() || sendMessage.isPending}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-text-muted">Select a conversation to view messages.</div>
        )}
      </div>
    </div>
  );
}
