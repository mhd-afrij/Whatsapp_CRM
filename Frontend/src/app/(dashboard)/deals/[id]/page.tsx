"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useDeal, useMarkDealWon, useMarkDealLost } from "@/hooks/use-deals";
import { LabelPicker } from "@/components/labels/label-picker";
import { ApiError } from "@/lib/api-client";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function DealDetail({ id }: { id: number }) {
  const router = useRouter();
  const { data: deal, isLoading, isError } = useDeal(id);
  const wonMutation = useMarkDealWon(id);
  const lostMutation = useMarkDealLost(id);
  const canManage = usePermission("deals.manage");

  const [error, setError] = useState<string | null>(null);
  const [showLostPrompt, setShowLostPrompt] = useState(false);
  const [lostReason, setLostReason] = useState("");

  if (isLoading) return <DetailSkeleton />;
  if (isError || !deal) {
    return <p className="text-sm text-danger">Unable to load this deal. It may not exist or you may lack access.</p>;
  }

  const onWon = async () => {
    setError(null);
    try {
      await wonMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to mark deal as won.");
    }
  };

  const onSubmitLost = async () => {
    setError(null);
    if (!lostReason.trim()) {
      setError("A lost reason is required.");
      return;
    }
    try {
      await lostMutation.mutateAsync(lostReason.trim());
      setShowLostPrompt(false);
      setLostReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to mark deal as lost.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => router.push("/deals")}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Back to deals
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">{deal.title}</h1>
          <p className="text-sm text-muted">
            {deal.stage?.name ?? "No stage"}
          </p>
        </div>
        <span
          className={
            "rounded-full px-3 py-1 text-xs font-semibold capitalize " +
            (deal.status === "won"
              ? "bg-success/10 text-success"
              : deal.status === "lost"
                ? "bg-danger/10 text-danger"
                : "bg-primary-soft text-primary-dark")
          }
        >
          {deal.status}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Labels</h2>
        <LabelPicker entity="deals" entityId={deal.id} currentLabels={deal.labels} canEdit={canManage} />
      </section>

      {canManage && deal.status === "open" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onWon}
            disabled={wonMutation.isPending}
            className="rounded-md bg-success px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Mark won
          </button>
          <button
            type="button"
            onClick={() => setShowLostPrompt(true)}
            className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
          >
            Mark lost
          </button>
        </div>
      )}

      {showLostPrompt && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
          <label htmlFor="lost-reason" className="mb-1 block text-sm font-medium text-text">
            Reason the deal was lost
          </label>
          <textarea
            id="lost-reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            placeholder="e.g. Budget cut, chose a competitor…"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onSubmitLost}
              disabled={lostMutation.isPending}
              className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirm lost
            </button>
            <button
              type="button"
              onClick={() => setShowLostPrompt(false)}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Details</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Value</dt>
            <dd className="text-text">{formatMoney(Number(deal.value_amount ?? 0), deal.value_currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Probability</dt>
            <dd className="text-text">{deal.probability_percent ?? "—"}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Contact</dt>
            <dd className="text-text">{deal.contact?.full_name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Owner</dt>
            <dd className="text-text">{deal.owner?.name || "Unassigned"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Expected close date</dt>
            <dd className="text-text">{deal.expected_close_date || "—"}</dd>
          </div>
          {deal.status === "lost" && deal.lost_reason && (
            <div className="flex justify-between">
              <dt className="text-muted">Lost reason</dt>
              <dd className="text-danger">{deal.lost_reason}</dd>
            </div>
          )}
          {deal.closed_at && (
            <div className="flex justify-between">
              <dt className="text-muted">Closed at</dt>
              <dd className="text-text">{formatDate(deal.closed_at)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Stage history</h2>
        {deal.stage_history && deal.stage_history.length > 0 ? (
          <ol className="space-y-3 text-sm">
            {[...deal.stage_history]
              .sort((a, b) => new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime())
              .map((entry) => (
                <li key={entry.id} className="border-l-2 border-primary-soft pl-3">
                  <p className="text-text">
                    {entry.from_stage ? entry.from_stage.name : "Created"} → {entry.to_stage?.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(entry.moved_at)} by {entry.moved_by?.name || "system"}
                  </p>
                </li>
              ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No stage history yet.</p>
        )}
      </section>

    </div>
  );
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  return (
    <RequirePermission permission="deals.manage">
      <DealDetail id={id} />
    </RequirePermission>
  );
}
