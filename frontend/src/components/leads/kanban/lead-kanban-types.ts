/**
 * Shared types + presentation metadata for the healthcare-themed WhatsApp lead
 * kanban (see the design preview at /lead-kanban). The card component itself is
 * intentionally framework-light: it only depends on lucide icons + Tailwind
 * design tokens, so it can be dropped into any Next/React CRM surface.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Baby,
  BadgeCheck,
  BellRing,
  CalendarClock,
  CalendarPlus,
  Dot as DotIcon,
  Eye,
  Flame,
  FlaskConical,
  HeartPulse,
  Inbox,
  MessageCircle,
  NotebookPen,
  Send,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
  Target,
  UserRoundCheck,
  XCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Domain types                                                       */
/* ------------------------------------------------------------------ */

/** Status shown on the card pill. */
export type LeadKanbanStatus =
  | "new"
  | "contacted"
  | "appointment"
  | "consultation"
  | "follow_up"
  | "qualified"
  | "converted"
  | "lost";

/** Pipeline column the card currently sits in. */
export type LeadKanbanStage =
  | "new"
  | "contacted"
  | "appointment_scheduled"
  | "consultation_completed"
  | "follow_up"
  | "qualified"
  | "converted"
  | "lost";

export type LeadKanbanPriority = "high" | "medium" | "low";

export type LeadKanbanActionId =
  | "create_appointment"
  | "add_note"
  | "convert_patient"
  | "send_template";

export interface LeadKanbanAssignedStaff {
  name: string;
  /** e.g. "Dentist", "Reception" */
  role?: string | null;
  avatar?: string | null;
}

/**
 * Props for <LeadKanbanCard />. Mirrors the original design brief 1:1, plus a
 * few optional extras (unreadCount, createdAt, reminder) that power the badge,
 * lead-age and appointment-reminder affordances.
 */
export interface LeadKanbanCardProps {
  id: string | number;
  patientName: string;
  /** Optional profile photo URL - falls back to initials. */
  avatar?: string | null;
  /** WhatsApp number, displayed as-is (e.g. "077 123 4567"). */
  phone: string;
  location?: string | null;
  /** Human-readable required service, e.g. "Dental Consultation". */
  service: string;
  /** Caption above the service line (defaults to "Service required"). */
  serviceLabel?: string;
  /** Icon + tint override when the auto-detected one is wrong for the domain. */
  serviceIcon?: LucideIcon;
  serviceAccent?: LeadKanbanServiceAccent;
  priority: LeadKanbanPriority;
  status: LeadKanbanStatus;
  /** Relabel the built-in quick actions for non-healthcare domains. */
  actionLabels?: Partial<Record<LeadKanbanActionId, string>>;
  lastMessage?: string | null;
  /** Unread WhatsApp messages. Drives the avatar badge + highlighted preview. */
  unreadCount?: number;
  assignedStaff?: LeadKanbanAssignedStaff | null;
  /** When the patient was last contacted (ISO string or Date). */
  lastContact?: string | Date | null;
  /** Next follow-up: preformatted label ("Tomorrow · 9:00 AM") or a Date. */
  nextFollowUp?: string | Date | null;
  /** When the lead was created - rendered as lead age (e.g. "2 days old"). */
  createdAt?: string | Date | null;
  /** Show the amber appointment-reminder chip. */
  reminder?: boolean;
  /** Action handlers - optional, the card works fine without them. */
  onOpenChat?: (leadId: LeadKanbanCardProps["id"]) => void;
  onViewProfile?: (leadId: LeadKanbanCardProps["id"]) => void;
  onAction?: (leadId: LeadKanbanCardProps["id"], action: LeadKanbanActionId) => void;
}

/** A card with its pipeline column attached, as consumed by the board. */
export interface LeadKanbanLead extends LeadKanbanCardProps {
  stage: LeadKanbanStage;
}

export interface LeadKanbanColumn {
  id: LeadKanbanStage;
  label: string;
  description: string;
}

export const DEFAULT_KANBAN_COLUMNS: LeadKanbanColumn[] = [
  { id: "new", label: "New Leads", description: "New WhatsApp inquiries" },
  { id: "contacted", label: "Contacted", description: "Agent replied" },
  { id: "appointment_scheduled", label: "Appointment Scheduled", description: "Booking confirmed" },
  { id: "consultation_completed", label: "Consultation Completed", description: "Doctor visit completed" },
  { id: "follow_up", label: "Follow Up", description: "Future communication" },
  { id: "converted", label: "Converted", description: "Patient registered" },
];

/* ------------------------------------------------------------------ */
/* Visual metadata (static class strings so Tailwind can see them)    */
/* ------------------------------------------------------------------ */

interface ToneMeta {
  /** Small square icon tile inside the column header. */
  iconTile: string;
  /** Icon itself. */
  iconClass: string;
  /** Neutral count chip in the header. */
  countChip: string;
  /** Stage accent used for the column border. */
  borderClass: string;
}

export const KANBAN_STAGE_META: Record<LeadKanbanStage, ToneMeta & { icon: LucideIcon }> = {
  new: {
    icon: Inbox,
    iconTile: "bg-sky-500/10",
    iconClass: "text-sky-600 dark:text-sky-400",
    countChip: "text-sky-700 bg-sky-500/10 dark:text-sky-300 dark:bg-sky-400/10",
    borderClass: "border-emerald-500/55 dark:border-emerald-400/45",
  },
  contacted: {
    icon: MessageCircle,
    iconTile: "bg-teal-500/10",
    iconClass: "text-teal-600 dark:text-teal-400",
    countChip: "text-teal-700 bg-teal-500/10 dark:text-teal-300 dark:bg-teal-400/10",
    borderClass: "border-sky-500/55 dark:border-sky-400/45",
  },
  appointment_scheduled: {
    icon: CalendarClock,
    iconTile: "bg-violet-500/10",
    iconClass: "text-violet-600 dark:text-violet-400",
    countChip: "text-violet-700 bg-violet-500/10 dark:text-violet-300 dark:bg-violet-400/10",
    borderClass: "border-amber-500/60 dark:border-amber-400/50",
  },
  consultation_completed: {
    icon: Stethoscope,
    iconTile: "bg-cyan-500/10",
    iconClass: "text-cyan-600 dark:text-cyan-400",
    countChip: "text-cyan-700 bg-cyan-500/10 dark:text-cyan-300 dark:bg-cyan-400/10",
    borderClass: "border-cyan-500/55 dark:border-cyan-400/45",
  },
  follow_up: {
    icon: BellRing,
    iconTile: "bg-amber-500/10",
    iconClass: "text-amber-600 dark:text-amber-400",
    countChip: "text-amber-700 bg-amber-500/10 dark:text-amber-300 dark:bg-amber-400/10",
    borderClass: "border-orange-500/60 dark:border-orange-400/50",
  },
  qualified: {
    icon: Target,
    iconTile: "bg-indigo-500/10",
    iconClass: "text-indigo-600 dark:text-indigo-400",
    countChip: "text-indigo-700 bg-indigo-500/10 dark:text-indigo-300 dark:bg-indigo-400/10",
    borderClass: "border-indigo-500/55 dark:border-indigo-400/45",
  },
  converted: {
    icon: BadgeCheck,
    iconTile: "bg-emerald-500/10",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    countChip: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300 dark:bg-emerald-400/10",
    borderClass: "border-green-500/60 dark:border-green-400/50",
  },
  lost: {
    icon: XCircle,
    iconTile: "bg-slate-500/10",
    iconClass: "text-slate-600 dark:text-slate-400",
    countChip: "text-slate-700 bg-slate-500/10 dark:text-slate-300 dark:bg-slate-400/10",
    borderClass: "border-slate-500/55 dark:border-slate-400/45",
  },
};

interface StatusMeta {
  label: string;
  /** Status pill classes (light + dark). */
  pill: string;
}

export const KANBAN_STATUS_META: Record<LeadKanbanStatus, StatusMeta> = {
  new: {
    label: "New",
    pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  },
  contacted: {
    label: "Contacted",
    pill: "bg-teal-500/10 text-teal-700 ring-teal-600/20 dark:bg-teal-400/15 dark:text-teal-300 dark:ring-teal-400/25",
  },
  appointment: {
    label: "Appointment",
    pill: "bg-sky-500/10 text-sky-700 ring-sky-600/20 dark:bg-sky-400/15 dark:text-sky-300 dark:ring-sky-400/25",
  },
  consultation: {
    label: "Consultation",
    pill: "bg-violet-500/10 text-violet-700 ring-violet-600/20 dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/25",
  },
  follow_up: {
    label: "Follow Up",
    pill: "bg-amber-500/10 text-amber-700 ring-amber-600/25 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/25",
  },
  qualified: {
    label: "Qualified",
    pill: "bg-indigo-500/10 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-400/15 dark:text-indigo-300 dark:ring-indigo-400/25",
  },
  converted: {
    label: "Converted",
    pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  },
  lost: {
    label: "Lost",
    pill: "bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-slate-400/25",
  },
};

export const KANBAN_PRIORITY_META: Record<
  LeadKanbanPriority,
  { label: string; icon: LucideIcon; chip: string }
> = {
  high: {
    label: "High priority",
    icon: Flame,
    chip: "border-danger/25 bg-danger/10 text-danger",
  },
  medium: {
    label: "Medium priority",
    icon: Star,
    chip: "border-warning/30 bg-warning/10 text-warning-dark dark:text-warning",
  },
  low: {
    label: "Low priority",
    icon: DotIcon,
    chip: "border-border bg-bg text-muted",
  },
};

export const KANBAN_ACTION_META: Record<
  LeadKanbanActionId,
  { label: string; icon: LucideIcon }
> = {
  create_appointment: { label: "Create appointment", icon: CalendarPlus },
  add_note: { label: "Add note", icon: NotebookPen },
  convert_patient: { label: "Convert patient", icon: UserRoundCheck },
  send_template: { label: "Send template message", icon: Send },
};

export type LeadKanbanServiceAccent =
  | "sky"
  | "violet"
  | "teal"
  | "rose"
  | "pink"
  | "cyan"
  | "indigo"
  | "amber"
  | "red"
  | "emerald";

/* ------------------------------------------------------------------ */
/* Service → icon/tone resolution                                     */
/* ------------------------------------------------------------------ */

interface ServiceTone {
  /** Colored icon tile inside the service panel. */
  box: string;
  /** Panel border/background tint. */
  panel: string;
}

const SERVICE_TONES: Record<string, ServiceTone> = {
  sky: {
    box: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    panel: "border-sky-200/70 bg-sky-50/80 dark:border-sky-500/20 dark:bg-sky-500/[0.07]",
  },
  violet: {
    box: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    panel: "border-violet-200/70 bg-violet-50/80 dark:border-violet-500/20 dark:bg-violet-500/[0.07]",
  },
  teal: {
    box: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    panel: "border-teal-200/70 bg-teal-50/80 dark:border-teal-500/20 dark:bg-teal-500/[0.07]",
  },
  rose: {
    box: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    panel: "border-rose-200/70 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-500/[0.07]",
  },
  pink: {
    box: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
    panel: "border-pink-200/70 bg-pink-50/80 dark:border-pink-500/20 dark:bg-pink-500/[0.07]",
  },
  cyan: {
    box: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    panel: "border-cyan-200/70 bg-cyan-50/80 dark:border-cyan-500/20 dark:bg-cyan-500/[0.07]",
  },
  indigo: {
    box: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
    panel: "border-indigo-200/70 bg-indigo-50/80 dark:border-indigo-500/20 dark:bg-indigo-500/[0.07]",
  },
  amber: {
    box: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    panel: "border-amber-200/70 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/[0.07]",
  },
  red: {
    box: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    panel: "border-red-200/70 bg-red-50/80 dark:border-red-500/20 dark:bg-red-500/[0.07]",
  },
  emerald: {
    box: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    panel: "border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]",
  },
};

const SERVICE_RULES: Array<{ test: RegExp; icon: LucideIcon; tone: ServiceTone }> = [
  { test: /dental|orthodont|teeth|implant|root canal|filling/i, icon: Smile, tone: SERVICE_TONES.violet },
  { test: /lab|test|blood|urine|biopsy/i, icon: FlaskConical, tone: SERVICE_TONES.teal },
  { test: /physio|therapy|rehab|exercise/i, icon: Activity, tone: SERVICE_TONES.rose },
  { test: /skin|derma|cosmetic|laser/i, icon: Sparkles, tone: SERVICE_TONES.pink },
  { test: /vaccin|immun/i, icon: Syringe, tone: SERVICE_TONES.cyan },
  { test: /eye|vision|optical|glaucoma/i, icon: Eye, tone: SERVICE_TONES.indigo },
  { test: /child|baby|p(a)?ediatr/i, icon: Baby, tone: SERVICE_TONES.amber },
  { test: /heart|cardio|ecg|blood pressure/i, icon: HeartPulse, tone: SERVICE_TONES.red },
  { test: /checkup|consult|general|medical|review|scan|ultrasound|follow-up|follow up/i, icon: Stethoscope, tone: SERVICE_TONES.sky },
];

export function resolveServiceMeta(
  service: string
): { icon: LucideIcon; box: string; panel: string } {
  for (const rule of SERVICE_RULES) {
    if (rule.test.test(service)) {
      return { icon: rule.icon, box: rule.tone.box, panel: rule.tone.panel };
    }
  }
  return { icon: Stethoscope, box: SERVICE_TONES.emerald.box, panel: SERVICE_TONES.emerald.panel };
}

/** Tone classes for an explicit accent override (defaults to emerald). */
export function serviceAccentTone(
  accent?: LeadKanbanServiceAccent
): { box: string; panel: string } | null {
  if (!accent) return null;
  return SERVICE_TONES[accent] ?? null;
}

/* ------------------------------------------------------------------ */
/* Small time label helpers (local time, no tz config needed)         */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function timeLabel(date: Date): string {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridiem}`;
}

/** "Today · 10:30 AM" / "Yesterday · 6:12 PM" / "Aug 27 · 9:02 AM". */
export function formatLastContact(value: string | Date | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  const now = new Date();
  const todayKey = dayKey(now);

  if (dayKey(date) === todayKey) return `Today · ${timeLabel(date)}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return `Yesterday · ${timeLabel(date)}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? `${MONTHS[date.getMonth()]} ${date.getDate()} · ${timeLabel(date)}`
    : `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} · ${timeLabel(date)}`;
}

/** "New today" / "1 day old" / "2 days old". */
export function formatLeadAge(value: string | Date | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (days === 0) return "New today";
  return days === 1 ? "1 day old" : `${days} days old`;
}

export interface NextActionLabel {
  text: string;
  /** true when the follow-up date has already passed. */
  overdue: boolean;
  /** true when the follow-up lands today or tomorrow. */
  soon: boolean;
}

/** Label for the next-action chip: string passthrough, Dates get smart text. */
export function formatNextAction(value: string | Date | null | undefined): NextActionLabel | null {
  if (typeof value === "string") {
    return value.trim() ? { text: value.trim(), overdue: false, soon: false } : null;
  }
  const date = toDate(value);
  if (!date) return null;

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const todayKey = dayKey(now);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dayKey(date) === todayKey) {
    return { text: `Today · ${timeLabel(date)}`, overdue: diffMs < 0, soon: diffMs >= 0 };
  }
  if (dayKey(date) === dayKey(tomorrow)) {
    return { text: `Tomorrow · ${timeLabel(date)}`, overdue: false, soon: true };
  }
  const withinWeek = diffMs > 0 && diffMs < 7 * 24 * 60 * 60 * 1000;
  const base = withinWeek
    ? `${WEEKDAYS[date.getDay()]} · ${timeLabel(date)}`
    : `${MONTHS[date.getMonth()]} ${date.getDate()}${date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : ""}`;
  return { text: base, overdue: diffMs < 0, soon: false };
}
