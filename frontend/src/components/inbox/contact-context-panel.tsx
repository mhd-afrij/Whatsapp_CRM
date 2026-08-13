"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleAlert, MessageSquareText, NotebookPen, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useConversation, useConversationActions } from "@/hooks/use-conversations";
import { useConvertConversationToLead } from "@/hooks/use-leads";
import { useUsers } from "@/hooks/use-users";
import { useContact } from "@/hooks/use-contacts";
import { useCreateNote, useNoteList } from "@/hooks/use-notes";
import { useTaskList } from "@/hooks/use-tasks";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { LabelPicker } from "@/components/labels/label-picker";
import { Avatar } from "@/components/ui/avatar";
import { ApiError } from "@/lib/api-client";
import { ChatOverviewPanel } from "@/components/contacts/chat-overview-panel";

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text">{value}</dd>
    </div>
  );
}

export function ContactContextPanel({ conversationId }: { conversationId: number }) {
  const { data: conversation, isLoading } = useConversation(conversationId);
  const { assign, close, reopen } = useConversationActions(conversationId);
  const canAssign = usePermission("conversations.assign");
  const canClose = usePermission("conversations.close");
  const canReopen = usePermission("conversations.reopen");
  const canManageLeads = usePermission("leads.manage");
  const canManageLabels = usePermission("conversations.reply");
  const { data: users } = useUsers();
  const convertMutation = useConvertConversationToLead();
  const router = useRouter();
  const [convertError, setConvertError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "chat" | "notes" | "tasks">("overview");
  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "tasks">("overview");
  const contactId = conversation?.contact?.id ?? null;
  const { data: contact } = useContact(contactId ?? 0);
  const { data: notes } = useNoteList({ conversation_id: conversationId });
  const { data: tasks } = useTaskList({ conversation_id: conversationId, per_page: 10 });
  const { data: whatsapp } = useWhatsappStatus();
  const createNote = useCreateNote({ conversation_id: conversationId });
  const contactDisplay = useMemo(
    () =>
      contact?.full_name ||
      conversation?.contact?.full_name ||
      conversation?.whatsapp_contact?.push_name ||
      conversation?.whatsapp_contact?.phone_number ||
      "Unknown contact",
    [contact, conversation]
  );

  if (isLoading || !conversation) {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-l border-border bg-surface">
        <div className="h-28 animate-pulse border-b border-border bg-bg" />
        <div className="space-y-3 overflow-hidden p-3">
          <div className="h-24 animate-pulse rounded-2xl bg-bg" />
          <div className="h-24 animate-pulse rounded-2xl bg-bg" />
        </div>
      </div>
    );
  }

  const name = contactDisplay;
  const phoneNumber =
    contact?.phone_number ?? conversation.whatsapp_contact?.phone_number ?? conversation.whatsapp_contact?.wa_jid ?? null;
  const statusLabel = conversation.whatsapp_contact?.push_name ? "WhatsApp contact" : "CRM contact";

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-l border-border bg-surface">
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-4 text-center backdrop-blur">
        <Avatar name={name} size="lg" className="mx-auto" />
        <p className="mt-3 text-base font-semibold text-text">{name}</p>
        {phoneNumber && <p className="font-mono text-sm text-muted">{phoneNumber}</p>}
        <p className="mt-1 text-xs text-muted">{statusLabel}</p>
        <p className="mt-2 text-[11px] text-muted">
          {whatsapp?.status === "connected"
            ? `WhatsApp connected${whatsapp.phoneNumber ? ` · ${whatsapp.phoneNumber}` : ""}`
            : `WhatsApp ${whatsapp?.status ?? "idle"}`}
        </p>
      </div>

      <div className="min-h-0 overflow-y-auto overflow-x-hidden p-3">
        <div className="space-y-3">
          <div className="flex gap-2 rounded-2xl border border-border bg-bg p-1 text-xs">
            {(["overview", "chat", "notes", "tasks"] as const).map((tab) => (
            {(["overview", "notes", "tasks"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2 font-medium capitalize",
                  activeTab === tab ? "bg-surface text-text shadow-sm" : "text-muted"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <>
          <SectionCard title="Contact information">
            <dl className="space-y-2">
              {phoneNumber && <DetailRow label="Phone" value={phoneNumber} />}
              {conversation.whatsapp_contact?.push_name && (
                <DetailRow label="WhatsApp name" value={conversation.whatsapp_contact.push_name} />
              )}
              {contact?.email && <DetailRow label="Email" value={contact.email} />}
              {contact?.company && <DetailRow label="Company" value={contact.company} />}
              {contact?.job_title && <DetailRow label="Job title" value={contact.job_title} />}
              {conversation.contact?.full_name && conversation.contact.full_name !== name && (
                <DetailRow label="CRM name" value={conversation.contact.full_name} />
              )}
              {!conversation.contact?.email && !conversation.whatsapp_contact?.push_name && (
                <p className="text-sm text-muted">No additional details on file.</p>
              )}
            </dl>
          </SectionCard>

          <SectionCard title="CRM controls">
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Assigned agent</p>
                {canAssign ? (
                  <select
                    value={conversation.assigned_user?.id ?? ""}
                    onChange={(event) => {
                      const id = event.target.value ? Number(event.target.value) : null;
                      assign.mutate({ assigned_user_id: id, assigned_team_id: null });
                    }}
                    disabled={assign.isPending}
                    className="w-full rounded-2xl border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {(users ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-text">
                    {conversation.assigned_user?.name ?? conversation.assigned_team?.name ?? "Unassigned"}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Labels</p>
                <LabelPicker
                  entity="conversations"
                  entityId={conversationId}
                  currentLabels={conversation.labels}
                  canEdit={canManageLabels}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Status">
            <p className="text-sm capitalize text-text">
              <span
                className={cn(
                  "mr-1.5 inline-block h-2 w-2 rounded-full align-middle",
                  conversation.status === "open" && "bg-success",
                  conversation.status === "pending" && "bg-warning",
                  conversation.status === "closed" && "bg-muted"
                )}
              />
              {conversation.status}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {canManageLeads && (
                <button
                  type="button"
                  disabled={convertMutation.isPending}
                  onClick={async () => {
                    setConvertError(null);
                    try {
                      const lead = await convertMutation.mutateAsync(conversationId);
                      router.push(`/leads/${lead.id}`);
                    } catch (error) {
                      setConvertError(error instanceof ApiError ? error.message : "Unable to convert to a lead.");
                    }
                  }}
                  className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/40 disabled:opacity-50"
                >
                  {convertMutation.isPending ? "Converting..." : "Convert to lead"}
                </button>
              )}

              {conversation.status === "closed" ? (
                canReopen && (
                  <button
                    type="button"
                    onClick={() => reopen.mutate()}
                    disabled={reopen.isPending}
                    className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/40 disabled:opacity-50"
                  >
                    Reopen conversation
                  </button>
                )
              ) : (
                canClose && (
                  <button
                    type="button"
                    onClick={() => close.mutate()}
                    disabled={close.isPending}
                    className="rounded-full border border-danger bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
                  >
                    Close conversation
                  </button>
                )
              )}
            </div>
            {convertError && <p className="mt-2 text-xs text-danger">{convertError}</p>}
          </SectionCard>
            </>
          )}

          {activeTab === "chat" && (
            <ChatOverviewPanel conversationId={conversationId} showOpenLink={false} compact />
          )}

          {activeTab === "notes" && (
            <SectionCard title="Notes">
              <div className="space-y-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const input = form.elements.namedItem("note") as HTMLTextAreaElement | null;
                    const body = input?.value.trim();
                    if (!body) return;
                    createNote.mutate({ conversation_id: conversationId, body });
                    if (input) input.value = "";
                  }}
                  className="space-y-2"
                >
                  <textarea
                    name="note"
                    placeholder="Add an internal note"
                    className="min-h-24 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={createNote.isPending}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add note
                  </button>
              )}

              {conversation.status === "closed" ? (
                canReopen && (
                  <button
                    type="button"
                    onClick={() => reopen.mutate()}
                    disabled={reopen.isPending}
                    className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/40 disabled:opacity-50"
                  >
                    Reopen conversation
                  </button>
                )
              ) : (
                canClose && (
                  <button
                    type="button"
                    onClick={() => close.mutate()}
                    disabled={close.isPending}
                    className="rounded-full border border-danger bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
                  >
                    Close conversation
                  </button>
                )
              )}
            </div>
            {convertError && <p className="mt-2 text-xs text-danger">{convertError}</p>}
          </SectionCard>
            </>
          )}

          {activeTab === "notes" && (
            <SectionCard title="Notes">
              <div className="space-y-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const input = form.elements.namedItem("note") as HTMLTextAreaElement | null;
                    const body = input?.value.trim();
                    if (!body) return;
                    createNote.mutate({ conversation_id: conversationId, body });
                    if (input) input.value = "";
                  }}
                  className="space-y-2"
                >
                  <textarea
                    name="note"
                    placeholder="Add an internal note"
                    className="min-h-24 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={createNote.isPending}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add note
                  </button>
                </form>
                <div className="space-y-2">
                  {(notes ?? []).slice(0, 5).map((note) => (
                    <div key={note.id} className="rounded-2xl border border-border bg-bg p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                        <span>{note.author?.name ?? "Unknown"}</span>
                        <span>{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-sm text-text whitespace-pre-wrap">{note.body}</p>
                    </div>
                  ))}
                  {(notes ?? []).length === 0 && (
                    <p className="text-sm text-muted">No internal notes yet.</p>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {activeTab === "tasks" && (
            <SectionCard title="Tasks">
              <div className="space-y-2">
                {(tasks?.data ?? []).slice(0, 5).map((task) => (
                  <div key={task.id} className="rounded-2xl border border-border bg-bg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-text">{task.title}</p>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                        {task.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {task.due_at ? `Due ${new Date(task.due_at).toLocaleDateString()}` : "No due date"}
                    </p>
                  </div>
                ))}
                {(tasks?.data ?? []).length === 0 && (
                  <p className="text-sm text-muted">No tasks linked to this conversation.</p>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
