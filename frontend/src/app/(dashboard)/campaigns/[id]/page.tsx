"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Send,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  useCampaign,
  useCampaignAnalytics,
  useCampaignMessages,
  useCancelCampaign,
  useDeleteCampaign,
  useSendCampaign,
} from "@/hooks/use-campaigns";
import type { CampaignStatus, CampaignMessageRow } from "@/lib/campaigns-api";
import { ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

const STATUS_META: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-bg text-muted" },
  scheduled: { label: "Scheduled", className: "bg-primary/10 text-primary" },
  sending: { label: "Sending…", className: "bg-warning/10 text-warning" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-danger/10 text-danger" },
  cancelled: { label: "Cancelled", className: "bg-bg text-muted" },
};

const ROW_STATUS_META: Record<CampaignMessageRow["status"], string> = {
  pending: "bg-bg text-muted",
  sent: "bg-success/10 text-success",
  failed: "bg-danger/10 text-danger",
  skipped: "bg-bg text-muted line-through",
};

const ROW_FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
] as const;

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

function CampaignDetail({ id }: { id: number }) {
  const router = useRouter();
  const canSend = usePermission("campaigns.send");
  const [rowStatusFilter, setRowStatusFilter] = useState<string>("");
  const [rowSearch, setRowSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const campaignQuery = useCampaign(id);
  const campaign = campaignQuery.data;
  const isActive = campaign?.status === "sending" || campaign?.status === "scheduled";

  const analytics = useCampaignAnalytics(id, { refetchWhileSending: isActive });
  // Recipients poll only while the campaign is actively working.
  const messages = useCampaignMessages({
    id,
    status: rowStatusFilter || undefined,
    search: rowSearch || undefined,
    refetchWhileSending: campaign?.status === "sending",
  });

  const sendMutation = useSendCampaign();
  const cancelMutation = useCancelCampaign();
  const deleteMutation = useDeleteCampaign();

  if (campaignQuery.isLoading) {
    return <p className="text-sm text-muted">Loading...</p>;
  }
  if (campaignQuery.isError || !campaign) {
    return (
      <ErrorState
        message={campaignQuery.error instanceof ApiError ? campaignQuery.error.message : "Unable to load campaign."}
        onRetry={() => campaignQuery.refetch()}
      />
    );
  }

  const meta = STATUS_META[campaign.status];
  const totals = analytics.data?.totals;

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-text">{campaign.name}</h1>
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", meta.className)}>
              {meta.label}
            </span>
          </div>
          {campaign.description && <p className="mt-1 text-sm text-muted">{campaign.description}</p>}
          <p className="mt-1 text-xs text-muted">
            Created {new Date(campaign.created_at).toLocaleString()}
            {campaign.scheduled_at && campaign.status === "scheduled" && (
              <>
                {" · "}Scheduled for {new Date(campaign.scheduled_at).toLocaleString()}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canSend && ["draft", "scheduled"].includes(campaign.status) && (
            <button
              type="button"
              disabled={sendMutation.isPending}
              onClick={() => act(() => sendMutation.mutateAsync(campaign.id), "Unable to start campaign.")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Send now
            </button>
          )}
          {canSend && ["draft", "scheduled", "sending"].includes(campaign.status) && (
            <button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() => act(() => cancelMutation.mutateAsync(campaign.id), "Unable to cancel campaign.")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-bg hover:text-text disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" /> Cancel
            </button>
          )}
          {["draft", "cancelled", "failed", "completed"].includes(campaign.status) && (
            <button
              type="button"
              aria-label={`Delete ${campaign.name}`}
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!window.confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
                void act(async () => {
                  await deleteMutation.mutateAsync(campaign.id);
                  router.push("/campaigns");
                }, "Unable to delete campaign.");
              }}
              className="rounded-md p-2 text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Targets" value={totals?.targets ?? campaign.total_targets} />
        <StatCard icon={CheckCircle2} label="Sent" value={totals?.sent ?? campaign.sent_count} />
        <StatCard icon={AlertTriangle} label="Failed" value={totals?.failed ?? campaign.failed_count} />
        <StatCard icon={Clock} label="Pending" value={totals?.pending ?? 0} />
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-text">Message</h2>
        <p className="whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-sm text-text">
          {campaign.message_content}
        </p>
        {campaign.audience_filter && (
          <p className="mt-2 text-xs text-muted">
            Audience:{" "}
            {[
              campaign.audience_filter.labels?.length
                ? `${campaign.audience_filter.labels.length} label(s)`
                : null,
              campaign.audience_filter.statuses?.length
                ? campaign.audience_filter.statuses.join(", ")
                : null,
              campaign.audience_filter.search ? `"${campaign.audience_filter.search}"` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "all contacts"}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-text">Recipients</h2>
          <div className="flex items-center gap-2">
            <select
              value={rowStatusFilter}
              onChange={(e) => setRowStatusFilter(e.target.value)}
              aria-label="Filter recipients by status"
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text"
            >
              {ROW_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              value={rowSearch}
              onChange={(e) => setRowSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="w-44 rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-text placeholder:text-muted"
            />
          </div>
        </div>

        {messages.isLoading && <p className="text-sm text-muted">Loading recipients...</p>}
        {messages.isError && (
          <ErrorState message="Unable to load recipients." onRetry={() => messages.refetch()} />
        )}
        {!messages.isLoading && !messages.isError && (messages.data?.length ?? 0) === 0 && (
          <p className="rounded-md border border-border bg-surface p-4 text-center text-sm text-muted">
            No recipients match this filter.
          </p>
        )}
        {!messages.isLoading && !messages.isError && (messages.data?.length ?? 0) > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {messages.data!.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">
                    {row.contact?.full_name ?? `Contact #${row.contact_id}`}
                  </p>
                  <p className="text-xs text-muted">{row.phone_number}</p>
                  {row.error && <p className="mt-0.5 truncate text-xs text-danger">{row.error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {row.sent_at && (
                    <span className="text-xs text-muted">
                      {new Date(row.sent_at).toLocaleString()}
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium capitalize",
                      ROW_STATUS_META[row.status]
                    )}
                  >
                    {row.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CampaignDetailPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);

  if (!Number.isFinite(id)) {
    return <ErrorState message="Invalid campaign id." onRetry={() => router.push("/campaigns")} />;
  }
  return <CampaignDetail id={id} />;
}

export default function CampaignDetailPage() {
  return (
    <RequirePermission permission="campaigns.view">
      <CampaignDetailPageInner />
    </RequirePermission>
  );
}
