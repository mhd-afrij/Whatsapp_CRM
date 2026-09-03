"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useConversationList } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";

function relativeTime(value: string | null) {
  if (!value) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-success-light/50 text-success dark:bg-success/10",
  pending: "bg-warning-light/50 text-warning-dark dark:bg-warning/10 dark:text-warning",
  closed: "bg-border/60 text-muted",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  closed: "Closed",
};

export function RecentActivity() {
  const { data, isLoading, isError } = useConversationList({ status: "open", per_page: 6 });
  const rows = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section className="card-hover relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Latest Customer Activity</p>
          <h2 className="mt-1 text-sm font-bold text-text">Recent conversations</h2>
        </div>
        <Link href="/inbox" className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline">
          Open inbox <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-shimmer rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-danger">Unable to load recent conversations.</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No customer conversations yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                <th className="px-2 pb-2.5 font-bold">Customer</th>
                <th className="px-2 pb-2.5 font-bold">Last message</th>
                <th className="px-2 pb-2.5 font-bold">Status</th>
                <th className="hidden px-2 pb-2.5 font-bold md:table-cell">Assigned agent</th>
                <th className="px-2 pb-2.5 text-right font-bold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const name = row.contact?.full_name || row.whatsapp_contact?.contact_name || row.whatsapp_contact?.push_name || "Unknown contact";
                const initials = name.slice(0, 1).toUpperCase();
                return (
                  <tr key={row.id} className="group">
                    <td className="px-2 py-3">
                      <Link href={`/inbox/${row.id}`} className="flex items-center gap-2.5">
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold", row.unread_count > 0 ? "bg-primary-soft text-primary-dark" : "bg-bg text-muted")}>
                          {initials}
                        </span>
                        <span className="truncate text-sm font-semibold text-text group-hover:text-primary">{name}</span>
                      </Link>
                    </td>
                    <td className="max-w-[220px] px-2 py-3">
                      <p className="truncate text-sm text-muted">{row.last_message_preview || "No message preview"}</p>
                    </td>
                    <td className="px-2 py-3">
                      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_STYLES[row.status] ?? "bg-border/60 text-muted")}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3 md:table-cell">
                      <span className="text-sm text-muted">{row.assigned_user?.name ?? "Unassigned"}</span>
                    </td>
                    <td className="px-2 py-3 text-right text-xs whitespace-nowrap text-muted">{relativeTime(row.last_message_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}