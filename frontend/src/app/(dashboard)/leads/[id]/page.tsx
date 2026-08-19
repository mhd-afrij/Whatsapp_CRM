"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Mail,
  Flame,
  Snowflake,
  Sun,
  ArrowUpDown,
  UserPlus,
  AlertTriangle,
  Repeat,
  Calendar,
  CheckCircle2,
  Clock,
  Pencil,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  useLead,
  useUpdateLead,
  useDeleteLead,
  useChangeLeadStage,
  useAssignLead,
  useConvertLead,
  useMarkLeadLost,
  useLeadActivities,
  useLeadTasks,
} from "@/hooks/use-leads";
import { useUsers } from "@/hooks/use-users";
import { LabelPicker } from "@/components/labels/label-picker";
import { ApiError } from "@/lib/api-client";
import type { LeadStage, LeadTemperature, Lead, LeadActivity } from "@/lib/leads-api";
import { STAGE_OPTIONS, TEMP_CONFIG, LOST_REASONS, relativeTime, formatCurrency } from "@/lib/leads-constants";

// ── Activity icons ─────────────────────────────────────────────────────

function activityIcon(type: string) {
  if (type.includes("stage")) return <ArrowUpDown className="h-4 w-4 text-purple-500" />;
  if (type.includes("owner")) return <UserPlus className="h-4 w-4 text-blue-500" />;
  if (type.includes("task")) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (type.includes("lost")) return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (type.includes("converted")) return <Repeat className="h-4 w-4 text-emerald-500" />;
  return <Clock className="h-4 w-4 text-muted" />;
}

// ── Skeleton ───────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-border/40" />
      ))}
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────

function LostModal({
  lead,
  onClose,
  onSubmit,
}: {
  lead: Lead;
  onClose: () => void;
  onSubmit: (reason: string, notes: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-text">Mark lead as lost</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Lost reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              <option value="">Select a reason…</option>
              {LOST_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-text">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
              placeholder="Optional notes about why this lead was lost…"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason}
            onClick={() => onSubmit(reason, notes)}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
          >
            Mark as lost
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvertModal({
  lead,
  onClose,
  onSubmit,
}: {
  lead: Lead;
  onClose: () => void;
  onSubmit: (title?: string) => void;
}) {
  const [title, setTitle] = useState(`${lead.contact?.full_name ?? "Lead"} — Lead #${lead.id}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-text">Convert lead to deal</h2>
        <p className="mb-4 text-sm text-muted">
          This will create a deal linked to this lead and contact. You can adjust the details from the pipeline board.
        </p>
        <div className="space-y-1">
          <label className="text-sm font-medium text-text">Deal title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(title || undefined)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Convert to deal
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignModal({
  lead,
  onClose,
  onSubmit,
}: {
  lead: Lead;
  onClose: () => void;
  onSubmit: (userId: number | null) => void;
}) {
  const { data: users } = useUsers();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-text">Assign lead</h2>
        <select
          defaultValue={lead.owner_user_id ?? ""}
          onChange={(e) => onSubmit(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
        >
          <option value="">Unassigned</option>
          {users?.map((u: any) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-muted hover:text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main detail component ──────────────────────────────────────────────

function LeadDetail({ id }: { id: number }) {
  const router = useRouter();
  const { data: lead, isLoading, isError } = useLead(id);
  const updateMutation = useUpdateLead(id);
  const deleteMutation = useDeleteLead();
  const changeStage = useChangeLeadStage(id);
  const assignMutation = useAssignLead(id);
  const convertMutation = useConvertLead(id);
  const markLostMutation = useMarkLeadLost(id);

  const { data: activities } = useLeadActivities(id);
  const { data: tasks } = useLeadTasks(id);

  const canEdit = usePermission("leads.manage");

  const [error, setError] = useState<string | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  if (isLoading) return <DetailSkeleton />;
  if (isError || !lead) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-danger">Unable to load this lead. It may not exist or you may lack access.</p>
      </div>
    );
  }

  const temp = TEMP_CONFIG[lead.temperature] ?? TEMP_CONFIG.cold;

  const tempIcon = lead.temperature === "hot"
    ? <Flame className="h-4 w-4 text-orange-500" />
    : lead.temperature === "warm"
    ? <Sun className="h-4 w-4 text-yellow-500" />
    : <Snowflake className="h-4 w-4 text-blue-400" />;

  const onStageChange = async (stage: LeadStage) => {
    if (stage === "lost") {
      setShowLostModal(true);
      return;
    }
    if (stage === "converted") {
      setShowConvertModal(true);
      return;
    }
    setError(null);
    try {
      await changeStage.mutateAsync({ stage });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update stage.");
    }
  };

  const onLostSubmit = async (reason: string, notes: string) => {
    setError(null);
    try {
      await markLostMutation.mutateAsync({ lost_reason: reason as any, lost_notes: notes });
      setShowLostModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to mark as lost.");
    }
  };

  const onConvert = async (title?: string) => {
    setError(null);
    try {
      await convertMutation.mutateAsync({ deal_title: title });
      setShowConvertModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to convert lead.");
    }
  };

  const onAssign = async (userId: number | null) => {
    setError(null);
    try {
      await assignMutation.mutateAsync({ owner_user_id: userId });
      setShowAssignModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to assign lead.");
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
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ── Back link ──────────────────────────────────────────── */}
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      {/* ── Header card (§6) ───────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-text truncate">
                {lead.contact?.full_name || `Contact #${lead.contact_id}`}
              </h1>
              <div className={`flex items-center gap-1 text-sm font-bold ${temp.color}`}>
                {tempIcon}
                {temp.label}
              </div>
            </div>
            {lead.contact?.phone_number && (
              <p className="text-sm text-muted mt-1">{lead.contact.phone_number}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="font-medium text-text">Stage:</span>
              <span className="capitalize">{lead.stage}</span>
              <span className="text-border">·</span>
              <span className="font-medium text-text">Score:</span>
              <span>{lead.score}/100</span>
              <span className="text-border">·</span>
              <span className="font-medium text-text">Owner:</span>
              <span>{lead.owner?.name || "Unassigned"}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {lead.contact?.phone_number && (
              <a
                href={`tel:${lead.contact.phone_number}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-primary-soft/30"
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
            {lead.contact?.phone_number && (
              <a
                href={`https://wa.me/${lead.contact.phone_number.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-primary-soft/30"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            {lead.contact?.email && (
              <a
                href={`mailto:${lead.contact.email}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-primary-soft/30"
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            )}
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-primary-soft/30"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Assign
                </button>
                <button
                  type="button"
                  onClick={() => setShowConvertModal(true)}
                  disabled={lead.stage === "converted"}
                  className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  <Repeat className="h-3.5 w-3.5" /> Convert
                </button>
                {lead.stage !== "lost" && (
                  <button
                    type="button"
                    onClick={() => setShowLostModal(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-danger bg-danger/10 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/20"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Lost
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1 rounded-md border border-danger bg-danger/10 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/20"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stage selector */}
        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            {STAGE_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => onStageChange(s.value)}
                disabled={lead.stage === s.value || changeStage.isPending}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  lead.stage === s.value
                    ? "bg-primary text-white"
                    : "border border-border bg-surface text-muted hover:bg-primary-soft/30"
                } disabled:cursor-default`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* ── Labels ─────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Labels</h2>
        <LabelPicker entity="leads" entityId={lead.id} currentLabels={lead.labels} canEdit={canEdit} />
      </section>

      {/* ── Two-column layout ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left: Details + Requirements ────────────────────── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Overview (§6) */}
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-text">Overview</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Source</dt>
                <dd className="capitalize text-text">{lead.source}</dd>
              </div>
              {lead.source_detail && (
                <div className="flex justify-between">
                  <dt className="text-muted">Source detail</dt>
                  <dd className="text-text">{lead.source_detail}</dd>
                </div>
              )}
              {lead.campaign && (
                <div className="flex justify-between">
                  <dt className="text-muted">Campaign</dt>
                  <dd className="text-text">{lead.campaign}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Contact</dt>
                <dd className="text-text">{lead.contact?.email || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="text-text">{new Date(lead.created_at).toLocaleDateString()}</dd>
              </div>
              {lead.lost_reason && (
                <div className="flex justify-between">
                  <dt className="text-muted">Lost reason</dt>
                  <dd className="capitalize text-danger">{lead.lost_reason.replace(/_/g, " ")}</dd>
                </div>
              )}
              {lead.lost_notes && (
                <div className="flex justify-between">
                  <dt className="text-muted">Lost notes</dt>
                  <dd className="text-text text-right max-w-[60%]">{lead.lost_notes}</dd>
                </div>
              )}
              {lead.converted_at && (
                <div className="flex justify-between">
                  <dt className="text-muted">Converted</dt>
                  <dd className="text-text">{new Date(lead.converted_at).toLocaleDateString()}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Requirements (§6) */}
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-text">Requirements</h2>
            <dl className="space-y-2.5 text-sm">
              {lead.property_type && (
                <div className="flex justify-between">
                  <dt className="text-muted">Property type</dt>
                  <dd className="text-text">{lead.property_type}</dd>
                </div>
              )}
              {lead.preferred_location && (
                <div className="flex justify-between">
                  <dt className="text-muted">Location</dt>
                  <dd className="text-text">{lead.preferred_location}</dd>
                </div>
              )}
              {lead.requirement_type && (
                <div className="flex justify-between">
                  <dt className="text-muted">Requirement</dt>
                  <dd className="capitalize text-text">{lead.requirement_type}</dd>
                </div>
              )}
              {(lead.budget_min != null || lead.budget_max != null) && (
                <div className="flex justify-between">
                  <dt className="text-muted">Budget</dt>
                  <dd className="text-text">
                    {formatCurrency(lead.budget_min)} – {formatCurrency(lead.budget_max)}
                  </dd>
                </div>
              )}
              {lead.bedrooms != null && (
                <div className="flex justify-between">
                  <dt className="text-muted">Bedrooms</dt>
                  <dd className="text-text">{lead.bedrooms}</dd>
                </div>
              )}
              {lead.bathrooms != null && (
                <div className="flex justify-between">
                  <dt className="text-muted">Bathrooms</dt>
                  <dd className="text-text">{lead.bathrooms}</dd>
                </div>
              )}
              {lead.notes && (
                <div className="pt-2 border-t border-border-muted">
                  <dt className="text-muted mb-1">Notes</dt>
                  <dd className="text-text whitespace-pre-wrap">{lead.notes}</dd>
                </div>
              )}
              {!lead.property_type && !lead.preferred_location && !lead.requirement_type &&
                lead.budget_min == null && lead.budget_max == null &&
                lead.bedrooms == null && lead.bathrooms == null && !lead.notes && (
                <p className="text-xs text-muted">No requirements recorded yet.</p>
              )}
            </dl>
          </section>

          {/* Linked deals */}
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-text">Linked deals</h2>
            {lead.deals && lead.deals.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {lead.deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="text-primary hover:underline">
                      {d.title}
                    </Link>{" "}
                    — <span className="capitalize text-muted">{d.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">
                No deals yet.{" "}
                {canEdit && (
                  <button type="button" onClick={() => setShowConvertModal(true)} className="text-primary hover:underline">
                    Convert this lead
                  </button>
                )}
              </p>
            )}
          </section>
        </div>

        {/* ── Right: Activity timeline + Tasks ──────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tasks (§9) */}
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-text">Tasks</h2>
            {tasks && Array.isArray(tasks) && tasks.length > 0 ? (
              <ul className="space-y-2">
                {tasks.map((task: any) => (
                  <li key={task.id} className="flex items-center gap-3 rounded-md border border-border-muted px-3 py-2">
                    <div className={`h-2 w-2 rounded-full ${task.status === "completed" ? "bg-green-500" : task.status === "overdue" ? "bg-red-500" : "bg-yellow-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${task.status === "completed" ? "line-through text-muted" : "text-text"}`}>
                        {task.title}
                      </p>
                      {task.due_at && (
                        <p className="text-xs text-muted mt-0.5">
                          Due: {new Date(task.due_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted capitalize">{task.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">No tasks yet. Create one from the tasks page.</p>
            )}
          </section>

          {/* Activity timeline (§19) */}
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-text">Activity Timeline</h2>
            {activities && activities.data && activities.data.length > 0 ? (
              <div className="relative space-y-4 pl-6">
                {/* Timeline line */}
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border-muted" />

                {activities.data.map((activity: LeadActivity) => (
                  <div key={activity.id} className="relative">
                    <div className="absolute -left-6 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface border border-border-muted">
                      {activityIcon(activity.activity_type)}
                    </div>
                    <div>
                      <p className="text-sm text-text">{activity.description ?? activity.activity_type}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {activity.creator?.name ?? "System"} · {relativeTime(activity.occurred_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No activity recorded yet.</p>
            )}
          </section>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {showLostModal && (
        <LostModal lead={lead} onClose={() => setShowLostModal(false)} onSubmit={onLostSubmit} />
      )}
      {showConvertModal && (
        <ConvertModal lead={lead} onClose={() => setShowConvertModal(false)} onSubmit={onConvert} />
      )}
      {showAssignModal && (
        <AssignModal lead={lead} onClose={() => setShowAssignModal(false)} onSubmit={onAssign} />
      )}
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
