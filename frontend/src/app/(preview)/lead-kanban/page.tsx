"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarCheck2,
  Eye,
  Inbox,
  MessagesSquare,
  Moon,
  MousePointer2,
  RotateCcw,
  Sun,
} from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { useToast } from "@/providers/toast-provider";
import { LeadKanbanBoard } from "@/components/leads/kanban/lead-kanban-board";
import { createDemoLeads } from "@/components/leads/kanban/lead-kanban-demo-data";
import { DEFAULT_KANBAN_COLUMNS } from "@/components/leads/kanban/lead-kanban-types";
import { cn } from "@/lib/utils";
import type { LeadKanbanCardProps, LeadKanbanLead, LeadKanbanStage } from "@/components/leads/kanban/lead-kanban-types";

export default function LeadKanbanPreviewPage() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadKanbanLead[]>(() => createDemoLeads());

  const stats = useMemo(
    () => ({
      total: leads.length,
      unread: leads.reduce((sum, lead) => sum + (lead.unreadCount ?? 0), 0),
      scheduled: leads.filter((lead) => lead.stage === "appointment_scheduled").length,
      converted: leads.filter((lead) => lead.stage === "converted").length,
    }),
    [leads]
  );

  const leadName = (leadId: LeadKanbanCardProps["id"]) =>
    leads.find((lead) => lead.id === leadId)?.patientName ?? "Patient";

  const stageLabel = (stage: LeadKanbanStage) =>
    DEFAULT_KANBAN_COLUMNS.find((column) => column.id === stage)?.label ?? stage;

  const moveLead = (leadId: LeadKanbanCardProps["id"], toStage: LeadKanbanStage) => {
    const name = leadName(leadId);
    const fromStage = leads.find((lead) => lead.id === leadId)?.stage;
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, stage: toStage } : lead))
    );
    toast(
      `Moved ${name} · ${fromStage ? stageLabel(fromStage) : "Unknown"} → ${stageLabel(toStage)}`,
      "success"
    );
  };

  const openChat = (leadId: LeadKanbanCardProps["id"]) =>
    toast(`Opening WhatsApp chat with ${leadName(leadId)} (demo)`, "info");
  const viewProfile = (leadId: LeadKanbanCardProps["id"]) =>
    toast(`Opening patient profile of ${leadName(leadId)} (demo)`, "info");

  const runCardAction: LeadKanbanCardProps["onAction"] = (leadId, action) => {
    const labels: Record<string, string> = {
      create_appointment: "Create appointment",
      add_note: "Add note",
      convert_patient: "Convert patient",
      send_template: "Send template message",
    };
    toast(`${labels[action] ?? action} for ${leadName(leadId)} (demo)`, "info");
  };

  return (
    <div className="min-h-dvh bg-bg text-text">
      {/* ------------------------------------------------ sticky toolbar */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[2200px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 ring-inset">
              <MessagesSquare className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.2em] text-primary uppercase">
                Design preview · WhatsApp CRM
              </p>
              <h1 className="truncate text-lg leading-tight font-semibold tracking-tight text-text">
                Patient lead board
              </h1>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-border/70 bg-surface px-2.5 py-1 text-[11px] font-medium text-muted lg:inline-flex">
              <MousePointer2 className="h-3 w-3" />
              Drag a card between stages to try it
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-muted transition hover:text-text"
            >
              {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <button
              type="button"
              onClick={() => setLeads(createDemoLeads())}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-muted transition hover:text-text"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[2200px] px-4 pt-5 pb-10 sm:px-6 lg:px-8">
        {/* ------------------------------------------------ summary chips */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: "Patients in view", value: stats.total, icon: Inbox, tone: "text-info bg-info/10" },
            { label: "Unread messages", value: stats.unread, icon: MessagesSquare, tone: "text-primary bg-primary/10" },
            { label: "Appointments scheduled", value: stats.scheduled, icon: CalendarCheck2, tone: "text-violet-600 bg-violet-500/10 dark:text-violet-400" },
            { label: "Converted", value: stats.converted, icon: BadgeCheck, tone: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] leading-tight text-muted">{label}</p>
                <p className="text-base leading-tight font-semibold text-text">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------ the board */}
        <LeadKanbanBoard
          leads={leads}
          onStageChange={moveLead}
          onOpenChat={openChat}
          onViewProfile={viewProfile}
          onAction={runCardAction}
        />

        {/* ------------------------------------------------ footnotes */}
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            Visual preview only - cards use mock data and are not connected to the backend.
          </span>
          <span>Statuses: New · Contacted · Appointment · Consultation · Follow up · Converted</span>
        </div>
      </main>
    </div>
  );
}
