"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Megaphone, Plus, Search, Send, Trash2, XCircle } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  useCampaigns,
  useCancelCampaign,
  useDeleteCampaign,
  useSendCampaign,
} from "@/hooks/use-campaigns";
import type { CampaignStatus } from "@/lib/campaigns-api";
import { ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

const STATUS_META: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-bg text-muted" },
  scheduled: { label: "Scheduled", className: "bg-primary/10 text-primary" },
  sending: { label: "Sending", className: "bg-warning/10 text-warning" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-danger/10 text-danger" },
  cancelled: { label: "Cancelled", className: "bg-bg text-muted" },
};

const STATUS_FILTERS: Array<{ value: CampaignStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sending", label: "Sending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function CampaignList() {
  const router = useRouter();
  const canCreate = usePermission("campaigns.create");
  const canSend = usePermission("campaigns.send");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "">("");
  const [rowError, setRowError] = useState<string | null>(null);
  const { data: campaigns, isLoading, isError, refetch } = useCampaigns({
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const sendMutation = useSendCampaign();
  const cancelMutation = useCancelCampaign();
  const deleteMutation = useDeleteCampaign();

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    setRowError(null);
    try {
      await fn();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : fallback);
    }
  };

  const deletable = (status: CampaignStatus) =>
    ["draft", "cancelled", "failed", "completed"].includes(status);
  const cancellable = (status: CampaignStatus) =>
    ["draft", "scheduled", "sending"].includes(status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Campaigns</h1>
          <p className="mt-1 text-sm text-muted">
            Send bulk WhatsApp messages to segmented contact audiences.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/campaigns/new"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" /> New Campaign
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full rounded-md border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | "")}
          aria-label="Filter by status"
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading...</p>}
      {isError && <ErrorState message="Unable to load campaigns." onRetry={() => refetch()} />}
      {!isLoading && !isError && (campaigns?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="py-8 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-muted/50" />
            <p className="mt-2 text-sm text-muted">No campaigns yet.</p>
            {canCreate && (
              <p className="text-xs text-muted">Create your first campaign to get started.</p>
            )}
          </div>
        </div>
      )}

      {rowError && (
        <p role="alert" className="text-sm text-danger">
          {rowError}
        </p>
      )}

      {!isLoading && !isError && campaigns && campaigns.length > 0 && (
        <ul className="space-y-2">
          {campaigns.map((campaign) => {
            const meta = STATUS_META[campaign.status];
            return (
              <li key={campaign.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/campaigns/${campaign.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/campaigns/${campaign.id}`);
                  }}
                  className="flex cursor-pointer flex-col gap-2 rounded-md border border-border bg-surface px-3 py-3 hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{campaign.name}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", meta.className)}>
                        {meta.label}
                      </span>
                      {campaign.scheduled_at && campaign.status === "scheduled" && (
                        <span className="text-xs text-muted">
                          for {new Date(campaign.scheduled_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">
                      {campaign.description || campaign.message_content}
                    </p>
                    {(campaign.total_targets > 0 || campaign.status !== "draft") && (
                      <p className="mt-1 text-xs text-muted">
                        {campaign.sent_count}/{campaign.total_targets} sent
                        {campaign.failed_count > 0 ? ` · ${campaign.failed_count} failed` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {canSend &&
                      ["draft", "scheduled"].includes(campaign.status) &&
                      campaign.total_targets >= 0 && (
                        <button
                          type="button"
                          disabled={sendMutation.isPending || cancelMutation.isPending}
                          onClick={() =>
                            act(
                              () => sendMutation.mutateAsync(campaign.id),
                              "Unable to start campaign."
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {campaign.status === "scheduled" ? "Send now" : "Send"}
                        </button>
                      )}
                    {canSend && cancellable(campaign.status) && (
                      <button
                        type="button"
                        disabled={sendMutation.isPending || cancelMutation.isPending}
                        onClick={() =>
                          act(
                            () => cancelMutation.mutateAsync(campaign.id),
                            "Unable to cancel campaign."
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-bg hover:text-text disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </button>
                    )}
                    {deletable(campaign.status) && (
                      <button
                        type="button"
                        disabled={deleteMutation.isPending}
                        aria-label={`Delete ${campaign.name}`}
                        onClick={() => {
                          if (!window.confirm(`Delete "${campaign.name}"? This cannot be undone.`)) {
                            return;
                          }
                          void act(
                            () => deleteMutation.mutateAsync(campaign.id),
                            "Unable to delete campaign."
                          );
                        }}
                        className="rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <RequirePermission permission="campaigns.view">
      <CampaignList />
    </RequirePermission>
  );
}
