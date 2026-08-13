"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversation, useMessages } from "@/hooks/use-conversations";
import { SlaIndicator } from "@/components/inbox/sla-indicator";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text">{value}</dd>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold text-text">Chat overview</h2>
      <div className="space-y-3">
        <div className="h-12 animate-pulse rounded-md bg-border/60" />
        <div className="h-12 animate-pulse rounded-md bg-border/60" />
        <div className="h-12 animate-pulse rounded-md bg-border/60" />
      </div>
    </section>
  );
}

/**
 * Chat overview for a conversation: activity stats, conversation summary
 * (status / priority / SLA / flags) and recent messages. Renders a friendly
 * empty state when there is no conversation. Use `compact` when embedding in
 * a narrow panel to keep the stats in two columns.
 */
export function ChatOverviewPanel({
  conversationId,
  showOpenLink = true,
  compact = false,
}: {
  conversationId: number | null;
  showOpenLink?: boolean;
  compact?: boolean;
}) {
  const { data: conversation, isLoading } = useConversation(conversationId);
  const { data: messages } = useMessages(conversationId);

  if (!conversationId) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Chat overview</h2>
        <p className="text-sm text-muted">No chat history for this contact yet.</p>
      </section>
    );
  }

  if (isLoading || !conversation) {
    return <OverviewSkeleton />;
  }

  const messagesLoading = messages === undefined;
  const msgs = messages?.data ?? [];
  const totalMessages = messages?.meta.total ?? msgs.length;
  const inbound = msgs.filter((message) => message.direction === "inbound").length;
  const outbound = msgs.filter((message) => message.direction === "outbound").length;
  const media = msgs.filter((message) => message.media).length;
  const recent = msgs.slice(0, 5);

  const flags = [
    conversation.pinned_at && "Pinned",
    conversation.starred_at && "Starred",
    conversation.muted_until && new Date(conversation.muted_until) > new Date() && "Muted",
    conversation.archived_at && "Archived",
    conversation.blocked_at && "Blocked",
    conversation.reported_at && "Reported",
  ].filter(Boolean) as string[];

  const statusDotClass =
    conversation.status === "open"
      ? "bg-success"
      : conversation.status === "pending"
        ? "bg-warning"
        : "bg-muted";

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Chat overview</h2>
        {showOpenLink && (
          <Link
            href={`/inbox/${conversationId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Open chat
          </Link>
        )}
      </div>

      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        {messagesLoading ? (
          [0, 1, 2, 3].map((index) => (
            <div key={index} className="h-11 animate-pulse rounded-md bg-border/60" />
          ))
        ) : (
          <>
            <StatChip label="Messages" value={totalMessages} />
            <StatChip label="Incoming" value={inbound} />
            <StatChip label="Outgoing" value={outbound} />
            <StatChip label="Media" value={media} />
          </>
        )}
      </div>
      {!messagesLoading && (
        <p className="mt-2 text-xs text-muted">Counts cover the most recent messages.</p>
      )}

      <dl className="mt-4 space-y-2 border-t border-border pt-4">
        <SummaryRow
          label="Status"
          value={
            <span className="inline-flex items-center gap-1.5 capitalize">
              <span className={cn("h-2 w-2 rounded-full", statusDotClass)} />
              {conversation.status}
            </span>
          }
        />
        <SummaryRow
          label="Priority"
          value={<span className="capitalize">{conversation.priority}</span>}
        />
        <SummaryRow label="Unread" value={conversation.unread_count} />
        {conversation.last_message_at && (
          <SummaryRow label="Last activity" value={formatDate(conversation.last_message_at)} />
        )}
        {conversation.whatsapp_contact?.last_seen_at && (
          <SummaryRow label="Last seen" value={formatDate(conversation.whatsapp_contact.last_seen_at)} />
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <SlaIndicator conversationId={conversationId} />
        {flags.map((flag) => (
          <span
            key={flag}
            className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-muted"
          >
            {flag}
          </span>
        ))}
      </div>

      <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        Recent messages
      </h3>
      {messagesLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-11 animate-pulse rounded-md bg-border/60" />
          ))}
        </div>
      ) : recent.length > 0 ? (
        <ul className="space-y-2">
          {recent.map((message) => (
            <li key={message.id} className="rounded-md border border-border bg-bg p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span
                  className={cn(
                    "flex items-center gap-1 font-medium",
                    message.direction === "inbound" ? "text-info" : "text-primary"
                  )}
                >
                  {message.direction === "inbound" ? (
                    <ArrowDownLeft className="h-3 w-3" />
                  ) : (
                    <ArrowUpRight className="h-3 w-3" />
                  )}
                  {message.direction === "inbound" ? "Incoming" : "Outgoing"}
                </span>
                <span className="text-muted">
                  {message.sent_at ? new Date(message.sent_at).toLocaleString() : "—"}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-text">
                {message.media ? `[${message.message_type}] ` : ""}
                {message.body || ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No messages in this chat yet.</p>
      )}
    </section>
  );
}
