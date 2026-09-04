"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  UsersRound,
} from "lucide-react";
import { LeadKanbanBoard } from "@/components/leads/kanban/lead-kanban-board";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { RequirePermission } from "@/components/auth/require-permission";
import { useLeadList, useMoveLead } from "@/hooks/use-leads";
import type { LeadFilters } from "@/lib/leads-api";
import { NewLeadModal } from "@/components/leads/new-lead-modal";
import { LEAD_PIPELINE_COLUMNS, leadToKanbanCard } from "@/lib/lead-mapping";
import type { LeadKanbanLead } from "@/components/leads/kanban/lead-kanban-types";

function LeadsView() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const filters: LeadFilters = { search: search || undefined, per_page: 100 };
  const { data, isLoading, isError, refetch, isFetching } = useLeadList(filters);
  const moveLeadMutation = useMoveLead();
  const leads = data?.data ?? [];

  const cards = leads
    .map(leadToKanbanCard)
    .filter((card): card is LeadKanbanLead => card !== null);
  const qualifiedCount = leads.filter((lead) => lead.stage === "qualified").length;
  const convertedCount = leads.filter((lead) => lead.stage === "converted").length;
  const unreadCount = leads.reduce((sum, lead) => sum + (lead.conversation?.unread_count ?? 0), 0);

  const openChat = (leadId: LeadKanbanLead["id"]) => {
    const lead = leads.find((item) => item.id === leadId);
    router.push(lead ? `/inbox?contact=${lead.contact_id}` : "/inbox");
  };

  const viewProfile = (leadId: LeadKanbanLead["id"]) => {
    const lead = leads.find((item) => item.id === leadId);
    if (lead) setSelectedLeadId(lead.id);
  };

  const runAction = (leadId: LeadKanbanLead["id"], action: string) => {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    if (action === "create_appointment") {
      router.push("/calendar");
      return;
    }
    if (action === "add_note") {
      router.push(`/leads/${lead.id}`);
      return;
    }
    if (action === "convert_patient") {
      if (lead.stage !== "converted") {
        void moveLeadMutation.mutateAsync({ id: lead.id, stage: "converted" });
      }
      return;
    }
    if (action === "send_template") {
      router.push(`/inbox?contact=${lead.contact_id}`);
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">
          Lead pipeline
        </h1>
        <button
          type="button"
          onClick={() => setShowNewLead(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          New lead
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Total leads", value: leads.length, icon: UsersRound, tone: "text-info bg-info/10" },
          { label: "Unread messages", value: unreadCount, icon: MessageCircle, tone: "text-primary bg-primary/10" },
          { label: "Converted", value: convertedCount, icon: BadgeCheck, tone: "text-success bg-success/10" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
              <p className="text-xl font-semibold text-text">{value}</p>
              <p className="text-[11px] text-muted">
                {label === "Total leads" ? `${qualifiedCount} qualified now` : "Across this view"}
              </p>
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people, phones, or lead notes…"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          aria-label="Refresh leads"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition hover:bg-border hover:text-text"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center text-sm text-muted">
          Loading your pipeline...
        </div>
      )}
      {isError && (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 p-8 text-center">
          <p className="text-sm font-semibold text-danger">The pipeline could not be loaded.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 text-xs font-semibold text-danger underline"
          >
            Try again
          </button>
        </div>
      )}
      {!isLoading && !isError && (
        <LeadKanbanBoard
          leads={cards}
          columns={LEAD_PIPELINE_COLUMNS}
          onStageChange={(leadId, toStage) => {
            const lead = leads.find((item) => item.id === leadId);
            if (lead && lead.stage !== toStage) {
              void moveLeadMutation.mutateAsync({ id: lead.id, stage: toStage });
            }
          }}
          onOpenChat={openChat}
          onViewProfile={viewProfile}
          onAction={runAction}
        />
      )}

      <LeadDetailDrawer
        leadId={selectedLeadId}
        open={selectedLeadId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null);
        }}
      />
      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} />}
    </main>
  );
}

export default function LeadsPage() {
  return (
    <RequirePermission permission="leads.manage">
      <LeadsView />
    </RequirePermission>
  );
}