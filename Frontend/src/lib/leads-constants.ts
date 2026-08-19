import type { LeadStage, LeadTemperature, LostReason } from "@/lib/leads-api";

// ── Stage options (shared across list, detail, board, and create modal) ──

export interface StageOption {
  value: LeadStage;
  label: string;
  color: string;
  headerBg: string;
  dotColor: string;
  terminal?: boolean;
}

export const STAGE_OPTIONS: StageOption[] = [
  { value: "new", label: "New", color: "bg-blue-100 text-blue-700", headerBg: "bg-blue-50", dotColor: "bg-blue-400" },
  { value: "contacted", label: "Contacted", color: "bg-yellow-100 text-yellow-700", headerBg: "bg-yellow-50", dotColor: "bg-yellow-400" },
  { value: "qualified", label: "Qualified", color: "bg-purple-100 text-purple-700", headerBg: "bg-purple-50", dotColor: "bg-purple-400" },
  { value: "viewing", label: "Viewing", color: "bg-indigo-100 text-indigo-700", headerBg: "bg-indigo-50", dotColor: "bg-indigo-400" },
  { value: "negotiation", label: "Negotiation", color: "bg-orange-100 text-orange-700", headerBg: "bg-orange-50", dotColor: "bg-orange-400" },
  { value: "converted", label: "Converted", color: "bg-emerald-100 text-emerald-700", headerBg: "bg-emerald-50", dotColor: "bg-emerald-400", terminal: true },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-700", headerBg: "bg-red-50", dotColor: "bg-red-400", terminal: true },
];

export const ACTIVE_STAGES = STAGE_OPTIONS.filter((s) => !s.terminal);
export const TERMINAL_STAGES = STAGE_OPTIONS.filter((s) => s.terminal);

export function stageLabel(stage: LeadStage): string {
  return STAGE_OPTIONS.find((s) => s.value === stage)?.label ?? stage;
}

export function stageBadgeClass(stage: LeadStage): string {
  return STAGE_OPTIONS.find((s) => s.value === stage)?.color ?? "bg-gray-100 text-gray-700";
}

// ── Temperature config ──────────────────────────────────────────────────

export interface TempConfig {
  label: string;
  color: string;
  badge: string;
}

export const TEMP_CONFIG: Record<LeadTemperature, TempConfig> = {
  hot: { label: "Hot", color: "text-orange-500", badge: "bg-orange-100 text-orange-700" },
  warm: { label: "Warm", color: "text-yellow-500", badge: "bg-yellow-100 text-yellow-700" },
  cold: { label: "Cold", color: "text-blue-400", badge: "bg-blue-100 text-blue-700" },
};

// ── Lost reasons ────────────────────────────────────────────────────────

export const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "price_too_high", label: "Price too high" },
  { value: "not_interested", label: "Not interested" },
  { value: "purchased_elsewhere", label: "Purchased elsewhere" },
  { value: "no_response", label: "No response" },
  { value: "invalid_lead", label: "Invalid lead" },
  { value: "duplicate", label: "Duplicate" },
  { value: "requirement_changed", label: "Requirement changed" },
  { value: "other", label: "Other" },
];

// ── Source options ──────────────────────────────────────────────────────

export const SOURCE_OPTIONS = [
  "website", "lead_form", "whatsapp", "facebook", "instagram",
  "referral", "phone", "email", "manual", "import", "api", "campaign", "other",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function formatCurrency(amount: number | null, currency = "USD"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}
