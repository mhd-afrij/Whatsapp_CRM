"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  GripVertical,
  User,
  Phone,
  MapPin,
  Home,
  AlertTriangle,
  Repeat,
} from "lucide-react";
import { useChangeLeadStage, useMarkLeadLost } from "@/hooks/use-leads";
import type { Lead, LeadStage, LeadTemperature, LostReason } from "@/lib/leads-api";
import { STAGE_OPTIONS, TEMP_CONFIG, LOST_REASONS, relativeTime } from "@/lib/leads-constants";
import { ApiError } from "@/lib/api-client";

// ── Stage config for kanban columns ────────────────────────────────────

interface StageConfig {
  key: LeadStage;
  label: string;
  color: string;
  headerBg: string;
  dotColor: string;
  terminal?: boolean;
}

const STAGES: StageConfig[] = STAGE_OPTIONS.map((s) => ({
  key: s.value,
  label: s.label,
  color: s.dotColor.replace("bg-", "bg-").replace("-400", "-500"),
  headerBg: s.headerBg,
  dotColor: s.dotColor,
  terminal: s.terminal,
}));

// ── Helpers ────────────────────────────────────────────────────────────

function tempIcon(temp: LeadTemperature) {
  if (temp === "hot") return <span className="text-orange-500">🔥</span>;
  if (temp === "warm") return <span className="text-yellow-500">☀</span>;
  return <span className="text-blue-400">❄</span>;
}

// ── Confirmation Modal ─────────────────────────────────────────────────

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${confirmColor}`}
          >
            {loading ? "Moving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lost Reason Modal ──────────────────────────────────────────────────

function LostReasonModal({
  lead,
  onClose,
  onSubmit,
  loading,
}: {
  lead: Lead;
  onClose: () => void;
  onSubmit: (reason: LostReason, notes: string) => void;
  loading: boolean;
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
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason || loading}
            onClick={() => onSubmit(reason as LostReason, notes)}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
          >
            {loading ? "Marking…" : "Mark as lost"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lead Card ──────────────────────────────────────────────────────────

function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: (e: React.DragEvent, lead: Lead) => void }) {
  const temp = TEMP_CONFIG[lead.temperature] ?? TEMP_CONFIG.cold;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className="group cursor-grab rounded-md border border-border bg-bg p-3 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      {/* Drag handle */}
      <div className="mb-2 flex items-center justify-between">
        <Link
          href={`/leads/${lead.id}`}
          className="font-medium text-primary hover:underline line-clamp-1"
        >
          {lead.contact?.full_name || `Contact #${lead.contact_id}`}
        </Link>
        <GripVertical className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Phone */}
      {lead.contact?.phone_number && (
        <div className="mb-1.5 flex items-center gap-1 text-xs text-muted">
          <Phone className="h-3 w-3" />
          {lead.contact.phone_number}
        </div>
      )}

      {/* Score + Temperature */}
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${temp.badge}`}>
          {tempIcon(lead.temperature)}
          <span>{lead.score}</span>
          <span>{temp.label}</span>
        </div>
      </div>

      {/* Location / Property */}
      {(lead.preferred_location || lead.property_type) && (
        <div className="mb-1.5 flex items-center gap-1 text-xs text-muted">
          {lead.property_type && (
            <>
              <Home className="h-3 w-3" />
              <span>{lead.property_type}</span>
            </>
          )}
          {lead.preferred_location && (
            <>
              {lead.property_type && <span>·</span>}
              <MapPin className="h-3 w-3" />
              <span className="line-clamp-1">{lead.preferred_location}</span>
            </>
          )}
        </div>
      )}

      {/* Footer: owner + time */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <div className="flex items-center gap-1">
          <User className="h-3 w-3" />
          <span className="line-clamp-1">{lead.owner?.name || "Unassigned"}</span>
        </div>
        <span>{relativeTime(lead.created_at)}</span>
      </div>

      {/* Lost reason indicator */}
      {lead.lost_reason && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-red-500">
          <AlertTriangle className="h-3 w-3" />
          {lead.lost_reason.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────

function StageColumn({
  stage,
  leads,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  movePending,
}: {
  stage: StageConfig;
  leads: Lead[];
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onDragOver: (e: React.DragEvent, stageKey: LeadStage) => void;
  onDrop: (e: React.DragEvent, stageKey: LeadStage) => void;
  isDragOver: boolean;
  movePending: boolean;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, stage.key);
      }}
      onDrop={(e) => onDrop(e, stage.key)}
      className={`flex w-72 shrink-0 flex-col rounded-lg border transition-colors ${
        isDragOver ? "border-primary bg-primary/5" : "border-border bg-surface"
      }`}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between border-b border-border px-3 py-2.5 ${stage.headerBg}`}>
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
          <h3 className="text-sm font-semibold text-text">{stage.label}</h3>
        </div>
        <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-muted">
          {leads.length}
        </span>
      </div>

      {/* Cards list */}
      <div className="flex-1 space-y-2 p-2.5">
        {leads.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted">
              {movePending ? "Moving…" : "Drop leads here"}
            </p>
          </div>
        )}
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  );
}

// ── Main Board ─────────────────────────────────────────────────────────

export function LeadKanbanBoard({
  leads,
  isLoading,
  isError,
  refetch,
}: {
  leads: Lead[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  // ── Drag state ────────────────────────────────────────────────────
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [optimisticLeads, setOptimisticLeads] = useState<Lead[] | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  // ── Terminal stage confirmation ───────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{
    lead: Lead;
    targetStage: LeadStage;
  } | null>(null);

  // ── Lost reason modal ────────────────────────────────────────────
  const [lostModal, setLostModal] = useState<Lead | null>(null);

  // ── Mutations ─────────────────────────────────────────────────────
  const changeStageMutation = useChangeLeadStage(0);
  const markLostMutation = useMarkLeadLost(0);

  // ── Group leads by stage ──────────────────────────────────────────
  const displayLeads = optimisticLeads ?? leads;

  const leadsByStage = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {
      new: [],
      contacted: [],
      qualified: [],
      viewing: [],
      negotiation: [],
      converted: [],
      lost: [],
    };
    for (const lead of displayLeads) {
      if (map[lead.stage]) {
        map[lead.stage].push(lead);
      }
    }
    return map;
  }, [displayLeads]);

  // ── Drag handlers ─────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(lead.id));

    // Set a custom drag image (optional, makes it nicer)
    const el = e.currentTarget as HTMLElement;
    if (el) {
      e.dataTransfer.setDragImage(el, 20, 20);
    }
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, stageKey: LeadStage) => {
    setDragOverStage(stageKey);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStage: LeadStage) => {
      e.preventDefault();
      setDragOverStage(null);

      if (!draggedLead) return;
      if (draggedLead.stage === targetStage) {
        setDraggedLead(null);
        return;
      }

      // Terminal stages require confirmation
      if (targetStage === "lost") {
        setConfirmModal({ lead: draggedLead, targetStage });
        setDraggedLead(null);
        return;
      }

      if (targetStage === "converted") {
        setDraggedLead(null);
        return;
      }

      // Optimistic update: move the card immediately
      const originalLeads = displayLeads;
      const optimistic = displayLeads.map((l) =>
        l.id === draggedLead.id ? { ...l, stage: targetStage } : l
      );
      setOptimisticLeads(optimistic);
      setMovingId(draggedLead.id);
      const leadId = draggedLead.id;
      setDraggedLead(null);

      try {
        await changeStageMutation.mutateAsync({ leadId, stage: targetStage });
        setOptimisticLeads(null);
      } catch (err) {
        setOptimisticLeads(originalLeads);
        console.error("Failed to move lead:", err);
      } finally {
        setMovingId(null);
      }
    },
    [draggedLead, displayLeads, changeStageMutation]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedLead(null);
    setDragOverStage(null);
  }, []);

  // ── Terminal stage confirmation handler ────────────────────────────

  const handleConfirmTerminal = useCallback(async () => {
    if (!confirmModal) return;

    const { lead, targetStage } = confirmModal;

    if (targetStage === "lost") {
      setConfirmModal(null);
      setLostModal(lead);
      return;
    }

    setConfirmModal(null);
  }, [confirmModal]);

  const handleLostSubmit = useCallback(async (reason: LostReason, notes: string) => {
    if (!lostModal) return;

    const lead = lostModal;
    const originalLeads = displayLeads;
    setOptimisticLeads(displayLeads.map((l) => (l.id === lead.id ? { ...l, stage: "lost" as LeadStage } : l)));
    setLostModal(null);

    try {
      await markLostMutation.mutateAsync({ leadId: lead.id, lost_reason: reason, lost_notes: notes });
      setOptimisticLeads(null);
    } catch (err) {
      setOptimisticLeads(originalLeads);
      console.error("Failed to mark lead as lost:", err);
    }
  }, [lostModal, displayLeads, markLostMutation]);

  // ── Render ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-80 w-72 shrink-0 animate-pulse rounded-lg bg-border/40" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-danger">Unable to load the leads board.</p>
        <button
          type="button"
          onClick={refetch}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex gap-4 overflow-x-auto pb-4"
        onDragEnd={handleDragEnd}
      >
        {STAGES.map((stage) => (
          <StageColumn
            key={stage.key}
            stage={stage}
            leads={leadsByStage[stage.key]}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            isDragOver={dragOverStage === stage.key}
            movePending={movingId !== null}
          />
        ))}
      </div>

      {/* Terminal stage confirmation modal */}
      {confirmModal && (
        <ConfirmModal
          title={`Mark lead as ${confirmModal.targetStage}?`}
          message={`This will move "${confirmModal.lead.contact?.full_name || "this lead"}" to the ${confirmModal.targetStage} stage. This action requires a reason.`}
          confirmLabel={`Mark as ${confirmModal.targetStage}`}
          confirmColor={confirmModal.targetStage === "lost" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"}
          onConfirm={handleConfirmTerminal}
          onCancel={() => setConfirmModal(null)}
          loading={false}
        />
      )}

      {/* Lost reason modal */}
      {lostModal && (
        <LostReasonModal
          lead={lostModal}
          onClose={() => setLostModal(null)}
          onSubmit={handleLostSubmit}
          loading={markLostMutation.isPending}
        />
      )}
    </>
  );
}
