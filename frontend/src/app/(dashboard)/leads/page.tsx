"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLeadList } from "@/hooks/use-leads";
import type { LeadFilters, LeadSource, LeadStatus } from "@/lib/leads-api";
import { LabelFilterChips } from "@/components/labels/label-filter-chips";
import { LabelBadge } from "@/components/labels/label-badge";
import { ErrorState } from "@/components/ui/error-state";
import { NewLeadModal } from "@/components/leads/new-lead-modal";

const STATUS_OPTIONS: LeadStatus[] = ["new", "contacted", "qualified", "disqualified", "converted"];
const SOURCE_OPTIONS: LeadSource[] = ["whatsapp", "manual", "import", "other"];

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function LeadsTable() {
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [page, setPage] = useState(1);
  const [labelIds, setLabelIds] = useState<number[]>([]);

  const filters: LeadFilters = {
    status: status || undefined,
    source: source || undefined,
    page,
    per_page: 20,
    labels: labelIds.length > 0 ? labelIds : undefined,
  };
  const { data, isLoading, isError, refetch } = useLeadList(filters);
  const leads = data?.data ?? [];
  const meta = data?.meta;
  const [showNewLead, setShowNewLead] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Leads</h1>
        <button
          type="button"
          onClick={() => setShowNewLead(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New lead
        </button>
      </div>

      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} />}

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as LeadStatus | "");
            setPage(1);
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as LeadSource | "");
            setPage(1);
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <LabelFilterChips
        selected={labelIds}
        onChange={(ids) => {
          setLabelIds(ids);
          setPage(1);
        }}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {isLoading && <TableSkeleton />}
        {isError && (
          <ErrorState message="Unable to load leads. Try again shortly." onRetry={() => refetch()} />
        )}
        {!isLoading && !isError && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-text">No leads yet</p>
            <p className="text-xs text-muted">
              Create one manually, or convert a contact or conversation into a lead.
            </p>
          </div>
        )}

        {!isLoading && !isError && leads.length > 0 && (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Labels</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-primary-soft/30">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
                      {lead.contact?.full_name || `Contact #${lead.contact_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{lead.status}</td>
                  <td className="px-4 py-3 capitalize text-muted">{lead.source}</td>
                  <td className="px-4 py-3 text-muted">{lead.owner?.name || "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted">{new Date(lead.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.labels.map((label) => (
                        <LabelBadge key={label.id} label={label} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.last_page && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {meta.page} of {meta.last_page} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!!meta.last_page && page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <RequirePermission permission="leads.manage">
      <LeadsTable />
    </RequirePermission>
  );
}
