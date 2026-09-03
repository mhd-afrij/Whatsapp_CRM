"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, MessageCircle, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KANBAN_ACTION_META,
  KANBAN_PRIORITY_META,
  KANBAN_STATUS_META,
  type LeadKanbanActionId,
  type LeadKanbanCardProps,
  type LeadKanbanPriority,
  type LeadKanbanStatus,
} from "@/components/leads/kanban/lead-kanban-types";

/* ------------------------------------------------------------------ */
/* Small deterministic helpers (avatar initials + colors)             */
/* ------------------------------------------------------------------ */

const AVATAR_PALETTE = ["#16a34a", "#2563eb", "#7c3aed", "#d97706", "#db2777", "#0891b2", "#dc2626"];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Dot color that matches each status pill tint. */
const STATUS_DOT: Record<LeadKanbanStatus, string> = {
  new: "bg-emerald-500",
  contacted: "bg-teal-500",
  appointment: "bg-sky-500",
  consultation: "bg-violet-500",
  follow_up: "bg-amber-500",
  qualified: "bg-indigo-500",
  converted: "bg-emerald-500",
  lost: "bg-slate-400",
};

const ACTION_ORDER: LeadKanbanActionId[] = [
  "create_appointment",
  "add_note",
  "convert_patient",
  "send_template",
];

function clampUnread(count: number): string {
  if (count <= 0) return "0";
  return count > 99 ? "99+" : String(count);
}

/* ------------------------------------------------------------------ */
/* Lightweight dropdown menu (token-styled, no extra deps)            */
/* ------------------------------------------------------------------ */

function CardActionsMenu({
  leadId,
  ariaLabel,
  openUp = false,
  className,
  labels,
  onAction,
}: {
  leadId: LeadKanbanCardProps["id"];
  ariaLabel: string;
  openUp?: boolean;
  className?: string;
  labels?: Partial<Record<LeadKanbanActionId, string>>;
  onAction?: (leadId: LeadKanbanCardProps["id"], action: LeadKanbanActionId) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAction = (action: LeadKanbanActionId) => {
    setOpen(false);
    onAction?.(leadId, action);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-border bg-surface p-1 text-muted transition hover:border-border hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          open && "bg-bg text-text"
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-30 min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl",
            openUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {ACTION_ORDER.map((actionId) => {
            const meta = KANBAN_ACTION_META[actionId];
            const Icon = meta.icon;
            const label = labels?.[actionId] ?? meta.label;
            return (
              <button
                key={actionId}
                type="button"
                role="menuitem"
                onClick={() => runAction(actionId)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-text transition hover:bg-bg"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Priority marker (icon only, tooltip carries the label)             */
/* ------------------------------------------------------------------ */

function PriorityTag({ priority }: { priority: LeadKanbanPriority }) {
  const meta = KANBAN_PRIORITY_META[priority];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1 py-0.5",
        meta.chip
      )}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The card                                                           */
/* ------------------------------------------------------------------ */

/**
 * High-density compact Kanban lead card for a WhatsApp-first healthcare CRM,
 * built for desktop dashboard use (down to ~50% zoom). Shows only the
 * essentials - avatar, name, status/priority badges, phone + location, and a
 * one-line message preview - so many leads fit on screen at once.
 */
export function LeadKanbanCard({
  id,
  patientName,
  avatar,
  phone,
  location,
  priority,
  status,
  lastMessage,
  unreadCount = 0,
  actionLabels,
  onViewProfile,
  onAction,
}: LeadKanbanCardProps) {
  const statusMeta = KANBAN_STATUS_META[status];
  const hasUnread = unreadCount > 0;

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open profile of ${patientName}`}
      onClick={() => onViewProfile?.(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onViewProfile?.(id);
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer rounded-lg border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200",
        "border-border/90 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.25)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.8)]"
      )}
    >
      <div className="p-2.5 pb-2">
        {/* ------------------------------------------------ header */}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote WhatsApp profile photos
              <img
                src={avatar}
                alt=""
                className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ring-2 ring-white/60"
                style={{ backgroundColor: colorFor(patientName) }}
              >
                {initialsFor(patientName)}
              </span>
            )}
            {hasUnread && (
              <span
                title={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
                className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white ring-2 ring-surface"
              >
                {clampUnread(unreadCount)}
              </span>
            )}
          </div>

          <span
            className="block min-w-0 flex-1 truncate text-[13px] leading-tight font-semibold text-text transition group-hover:text-primary"
            title={patientName}
          >
            {patientName}
          </span>

          <div className="flex shrink-0 items-center gap-1">
            <PriorityTag priority={priority} />
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ring-1 ring-inset",
                statusMeta.pill
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
              {statusMeta.label}
            </span>
            <CardActionsMenu
              leadId={id}
              ariaLabel={`More actions for ${patientName}`}
              labels={actionLabels}
              onAction={onAction}
            />
          </div>
        </div>

        {/* ------------------------------------------------ contact row */}
        <div className="mt-1.5 flex min-w-0 items-center gap-2.5 text-[11px] text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MessageCircle className="h-3 w-3 shrink-0 text-primary/70" />
            <span className="truncate">{phone}</span>
          </span>
          {location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-muted" />
              <span className="truncate">{location}</span>
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ message preview */}
      <div className="block w-full border-t border-border/70 px-2.5 py-1.5 transition group-hover:bg-bg/60">
        <p
          className={cn(
            "flex items-center gap-1.5 truncate text-[12px] leading-snug",
            hasUnread ? "font-medium text-primary" : "text-muted"
          )}
        >
          {hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
          <span className="truncate">{lastMessage || "No messages yet"}</span>
        </p>
      </div>
    </article>
  );
}