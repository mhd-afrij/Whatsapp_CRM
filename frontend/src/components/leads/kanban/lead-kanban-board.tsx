"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { LeadKanbanCard } from "@/components/leads/kanban/lead-kanban-card";
import {
  DEFAULT_KANBAN_COLUMNS,
  KANBAN_STAGE_META,
  type LeadKanbanCardProps,
  type LeadKanbanColumn,
  type LeadKanbanLead,
  type LeadKanbanStage,
} from "@/components/leads/kanban/lead-kanban-types";

const columnDropId = (stage: LeadKanbanStage) => `kanban-stage:${stage}`;

function SortableKanbanCard({
  lead,
  onOpenChat,
  onViewProfile,
  onAction,
}: {
  lead: LeadKanbanLead;
  onOpenChat?: LeadKanbanCardProps["onOpenChat"];
  onViewProfile?: LeadKanbanCardProps["onViewProfile"];
  onAction?: LeadKanbanCardProps["onAction"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    animateLayoutChanges: defaultAnimateLayoutChanges,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "transform 220ms cubic-bezier(0.2, 0, 0, 1)",
      }}
      {...attributes}
      {...listeners}
      suppressHydrationWarning
      className={cn(
        "rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        isDragging ? "z-50 cursor-grabbing scale-[1.03] shadow-xl opacity-90" : "cursor-grab active:cursor-grabbing"
      )}
    >
      <LeadKanbanCard
        {...lead}
        onOpenChat={onOpenChat ?? lead.onOpenChat}
        onViewProfile={onViewProfile ?? lead.onViewProfile}
        onAction={onAction ?? lead.onAction}
      />
    </div>
  );
}

function KanbanColumn({
  column,
  leads,
  onOpenChat,
  onViewProfile,
  onAction,
}: {
  column: LeadKanbanColumn;
  leads: LeadKanbanLead[];
  onOpenChat?: LeadKanbanCardProps["onOpenChat"];
  onViewProfile?: LeadKanbanCardProps["onViewProfile"];
  onAction?: LeadKanbanCardProps["onAction"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(column.id) });
  const meta = KANBAN_STAGE_META[column.id];
  const Icon = meta.icon;

  return (
    <section
      aria-label={`${column.label} patients`}
      className={cn("flex max-h-full w-[300px] shrink-0 flex-col rounded-xl border-2 bg-text/[0.028] p-1.5 transition-colors", meta.borderClass)}
    >
      <header className="flex items-center gap-2 px-1 pt-0.5 pb-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
            meta.iconTile
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", meta.iconClass)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xs leading-tight font-bold text-text">{column.label}</h2>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-px text-[10px] leading-4 font-bold",
                meta.countChip
              )}
            >
              {leads.length}
            </span>
          </div>
          <p className="truncate text-[10px] text-muted">{column.description}</p>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[72px] flex-1 flex-col gap-1.5 rounded-lg p-1 transition-all duration-200 ease-out",
          isOver && "bg-primary/5 ring-2 ring-primary/30 ring-inset scale-[1.01]"
        )}
      >
        {leads.length > 0 ? (
          <SortableContext
            items={leads.map((lead) => lead.id)}
            strategy={verticalListSortingStrategy}
          >
            {leads.map((lead) => (
              <SortableKanbanCard
                key={lead.id}
                lead={lead}
                onOpenChat={onOpenChat}
                onViewProfile={onViewProfile}
                onAction={onAction}
              />
            ))}
          </SortableContext>
        ) : (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed px-2 py-3 text-center",
              isOver
                ? "border-primary/50 text-primary"
                : "border-border/80 text-muted"
            )}
          >
            <p className="text-[10px] leading-relaxed">
              {isOver ? "Release to move here" : "No leads"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Healthcare kanban board for <LeadKanbanCard />. Columns default to the
 * New Leads → Contacted → Appointment → Consultation → Follow up → Converted
 * pipeline; cards can be dragged between columns (and re-ordered visually
 * within one).
 */
export function LeadKanbanBoard({
  leads,
  columns = DEFAULT_KANBAN_COLUMNS,
  onStageChange,
  onOpenChat,
  onViewProfile,
  onAction,
}: {
  leads: LeadKanbanLead[];
  columns?: LeadKanbanColumn[];
  onStageChange?: (leadId: LeadKanbanCardProps["id"], toStage: LeadKanbanStage) => void;
  onOpenChat?: LeadKanbanCardProps["onOpenChat"];
  onViewProfile?: LeadKanbanCardProps["onViewProfile"];
  onAction?: LeadKanbanCardProps["onAction"];
}) {
  const [activeLead, setActiveLead] = useState<LeadKanbanLead | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);

  const handleDragStart = (event: DragStartEvent) =>
    setActiveLead(leadById.get(event.active.id) ?? null);

  const handleDragCancel = () => setActiveLead(null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const lead = leadById.get(active.id);
    if (!lead) return;

    let targetStage: LeadKanbanStage | undefined;
    if (typeof over.id === "string" && over.id.startsWith("kanban-stage:")) {
      targetStage = over.id.slice("kanban-stage:".length) as LeadKanbanStage;
    } else {
      targetStage = leadById.get(over.id)?.stage;
    }

    if (targetStage && targetStage !== lead.stage) {
      onStageChange?.(lead.id, targetStage);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {columns.map((column) => {
          const columnLeads = leads.filter((lead) => lead.stage === column.id);
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              leads={columnLeads}
              onOpenChat={onOpenChat}
              onViewProfile={onViewProfile}
              onAction={onAction}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 250,
          easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
        }}
      >
        {activeLead ? (
          <div className="pointer-events-none w-[280px] rotate-[2.5deg] scale-[1.04] rounded-xl shadow-[0_28px_64px_-16px_rgba(15,23,42,0.45)] ring-2 ring-primary/30 transition-all duration-200 dark:shadow-[0_28px_64px_-16px_rgba(0,0,0,0.9)]">
            <LeadKanbanCard
              {...activeLead}
              onOpenChat={onOpenChat ?? activeLead.onOpenChat}
              onViewProfile={onViewProfile ?? activeLead.onViewProfile}
              onAction={onAction ?? activeLead.onAction}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
