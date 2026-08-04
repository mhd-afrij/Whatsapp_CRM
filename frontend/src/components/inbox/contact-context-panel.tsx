"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useConversation, useConversationActions } from "@/hooks/use-conversations";
import { useConvertConversationToLead } from "@/hooks/use-leads";
import { useUsers } from "@/hooks/use-users";
import { LabelPicker } from "@/components/labels/label-picker";
import { Avatar } from "@/components/ui/avatar";
import { ApiError } from "@/lib/api-client";

const TABS = [
  { key: "details", label: "Details" },
  { key: "crm", label: "CRM" },
] as const;

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text">{value}</dd>
    </div>
  );
}

/**
 * Right-hand context panel: profile header + Details/CRM tabs. Close/Reopen
 * live here (and in the chat header menu) instead of on the chat header so
 * the chat stays WhatsApp-style.
 */
export function ContactContextPanel({ conversationId }: { conversationId: number }) {
  const { data: conversation, isLoading } = useConversation(conversationId);
  const { assign, close, reopen } = useConversationActions(conversationId);
  const canAssign = usePermission("conversations.assign");
  const canClose = usePermission("conversations.close");
  const canReopen = usePermission("conversations.reopen");
  const canManageLeads = usePermission("leads.manage");
  const canManageLabels = usePermission("conversations.reply");
  const { data: users } = useUsers();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("details");
  const [convertError, setConvertError] = useState<string | null>(null);
  const convertMutation = useConvertConversationToLead();
  const router = useRouter();

  if (isLoading || !conversation) {
    return (
      <div className="h-full space-y-3 border-l border-border bg-surface p-4">
        <div className="h-20 animate-pulse rounded-md bg-border/60" />
        <div className="h-20 animate-pulse rounded-md bg-border/60" />
      </div>
    );
  }

  const name =
    conversation.contact?.full_name ||
    conversation.whatsapp_contact?.push_name ||
    conversation.whatsapp_contact?.phone_number ||
    "Unknown contact";
  const phoneNumber =
    conversation.whatsapp_contact?.phone_number ?? conversation.whatsapp_contact?.wa_jid ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-border bg-surface">
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-border p-5 text-center">
        <Avatar name={name} size="lg" />
        <p className="text-base font-semibold text-text">{name}</p>
        {phoneNumber && <p className="font-mono text-sm text-muted">{phoneNumber}</p>}
        <p className="text-xs capitalize text-muted">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-middle" />
          {conversation.whatsapp_contact?.push_name ? "WhatsApp contact" : "CRM contact"}
        </p>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-border px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-medium transition-colors",
              tab === t.key ? "border-b-2 border-primary text-primary" : "text-muted hover:text-text"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {tab === "details" && (
          <>
            <SectionCard title="Contact information">
              <dl className="space-y-2">
                {phoneNumber && <DetailRow label="Phone" value={phoneNumber} />}
                {conversation.whatsapp_contact?.push_name && (
                  <DetailRow label="WhatsApp name" value={conversation.whatsapp_contact.push_name} />
                )}
                {conversation.contact?.email && (
                  <DetailRow label="Email" value={conversation.contact.email} />
                )}
                {conversation.contact?.full_name && conversation.contact.full_name !== name && (
                  <DetailRow label="CRM name" value={conversation.contact.full_name} />
                )}
                {!conversation.contact?.email && !conversation.whatsapp_contact?.push_name && (
                  <p className="text-sm text-muted">No additional details on file.</p>
                )}
              </dl>
            </SectionCard>

            <SectionCard title="Media, links and documents">
              <p className="text-sm text-muted">No media shared in this conversation yet.</p>
            </SectionCard>

            <SectionCard title="Conversation status">
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
            </SectionCard>
          </>
        )}

        {tab === "crm" && (
          <>
            <SectionCard title="Assigned agent">
              {canAssign ? (
                <select
                  value={conversation.assigned_user?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    assign.mutate({ assigned_user_id: id, assigned_team_id: null });
                  }}
                  disabled={assign.isPending}
                  className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-text">
                  {conversation.assigned_user?.name ?? conversation.assigned_team?.name ?? "Unassigned"}
                </p>
              )}
            </SectionCard>

            <SectionCard title="Tags">
              <LabelPicker
                entity="conversations"
                entityId={conversationId}
                currentLabels={conversation.labels}
                canEdit={canManageLabels}
              />
            </SectionCard>

            <SectionCard title="Actions">
              <div className="flex flex-wrap gap-2">
                {canManageLeads && (
                  <button
                    type="button"
                    disabled={convertMutation.isPending}
                    onClick={async () => {
                      setConvertError(null);
                      try {
                        const lead = await convertMutation.mutateAsync(conversationId);
                        router.push(`/leads/${lead.id}`);
                      } catch (err) {
                        setConvertError(
                          err instanceof ApiError ? err.message : "Unable to convert to a lead."
                        );
                      }
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/50 disabled:opacity-50"
                  >
                    {convertMutation.isPending ? "Converting…" : "Convert to lead"}
                  </button>
                )}
                {conversation.status === "closed" ? (
                  canReopen && (
                    <button
                      type="button"
                      onClick={() => reopen.mutate()}
                      disabled={reopen.isPending}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/50 disabled:opacity-50"
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
                      className="rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
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
      </div>
    </div>
  );
}
