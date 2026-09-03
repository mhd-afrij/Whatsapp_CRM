"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useLead, useUpdateLead, useDeleteLead } from "@/hooks/use-leads";
import { LabelPicker } from "@/components/labels/label-picker";
import { ApiError } from "@/lib/api-client";
import type { LeadStatus } from "@/lib/leads-api";

const STATUS_OPTIONS: LeadStatus[] = ["new", "contacted", "qualified", "disqualified", "converted"];

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function LeadDetail({ id }: { id: number }) {
  const router = useRouter();
  const { data: lead, isLoading, isError } = useLead(id);
  const updateMutation = useUpdateLead(id);
  const deleteMutation = useDeleteLead();
  const canDelete = usePermission("leads.manage");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !lead) {
    return <p className="text-sm text-danger">Unable to load this lead. It may not exist or you may lack access.</p>;
  }

  const onStatusChange = async (status: LeadStatus) => {
    setError(null);
    try {
      await updateMutation.mutateAsync({ status });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update lead status.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(lead.id);
      router.push("/leads");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete lead.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">
            {lead.contact?.full_name || `Contact #${lead.contact_id}`}
          </h1>
          <p className="text-sm text-muted">Lead #{lead.id}</p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
          >
            Delete lead
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Labels</h2>
        <LabelPicker entity="leads" entityId={lead.id} currentLabels={lead.labels} canEdit={canDelete} />
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Details</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Source</dt>
            <dd className="capitalize text-text">{lead.source}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted">Status</dt>
            <dd>
              <select
                value={lead.status}
                onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
                disabled={updateMutation.isPending}
                className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Owner</dt>
            <dd className="text-text">{lead.owner?.name || "Unassigned"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Contact phone</dt>
            <dd className="text-text">{lead.contact?.phone_number || "—"}</dd>
          </div>
          {lead.notes && (
            <div className="flex justify-between">
              <dt className="text-muted">Notes</dt>
              <dd className="text-text">{lead.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Linked deals</h2>
        {lead.deals && lead.deals.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {lead.deals.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="text-primary hover:underline">
                  {d.title}
                </Link>{" "}
                — {d.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            No deals yet.{" "}
            <Link href="/pipeline" className="text-primary hover:underline">
              Create one from the pipeline board
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  return (
    <RequirePermission permission="leads.manage">
      <LeadDetail id={id} />
    </RequirePermission>
  );
}
