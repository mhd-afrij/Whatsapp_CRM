"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutList, Kanban, Plus } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLeadList } from "@/hooks/use-leads";
import { LeadKanbanBoard } from "@/components/leads/lead-kanban-board";
import { NewLeadModal } from "@/components/leads/new-lead-modal";
import type { LeadFilters } from "@/lib/leads-api";

function BoardPage() {
  const [showNewLead, setShowNewLead] = useState(false);

  // Fetch all active leads (not converted/lost) for the board
  const filters: LeadFilters = {
    per_page: 200,
    sort: "score",
    sort_desc: true,
  };

  const { data, isLoading, isError, refetch } = useLeadList(filters);
  const leads = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-text">Lead Pipeline</h1>
          <div className="flex rounded-md border border-border bg-surface">
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted hover:text-text"
            >
              <LayoutList className="h-4 w-4" />
              List
            </Link>
            <span className="inline-flex items-center gap-1.5 border-l border-border bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary-dark">
              <Kanban className="h-4 w-4" />
              Board
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNewLead(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New lead
        </button>
      </div>

      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} />}

      {/* ── Stats bar ──────────────────────────────────────────── */}
      {!isLoading && !isError && (
        <div className="flex flex-wrap gap-4 text-sm text-muted">
          <span>
            Total: <strong className="text-text">{leads.length}</strong>
          </span>
          <span>
            🔥 Hot:{" "}
            <strong className="text-orange-500">
              {leads.filter((l) => l.temperature === "hot").length}
            </strong>
          </span>
          <span>
            🟠 Warm:{" "}
            <strong className="text-yellow-500">
              {leads.filter((l) => l.temperature === "warm").length}
            </strong>
          </span>
          <span>
            🔵 Cold:{" "}
            <strong className="text-blue-400">
              {leads.filter((l) => l.temperature === "cold").length}
            </strong>
          </span>
        </div>
      )}

      {/* ── Board ──────────────────────────────────────────────── */}
      <LeadKanbanBoard
        leads={leads}
        isLoading={isLoading}
        isError={isError}
        refetch={refetch}
      />
    </div>
  );
}

export default function LeadBoardPage() {
  return (
    <RequirePermission permission="leads.manage">
      <BoardPage />
    </RequirePermission>
  );
}
