import { Building2, Home, Key, type LucideIcon } from "lucide-react";
import type { Lead } from "@/lib/leads-api";
import type {
  LeadKanbanColumn,
  LeadKanbanLead,
  LeadKanbanServiceAccent,
  LeadKanbanStage,
  LeadKanbanStatus,
} from "@/components/leads/kanban/lead-kanban-types";

/** Pipeline columns - same stage set the board always used, premium styling. */
export const LEAD_PIPELINE_COLUMNS: LeadKanbanColumn[] = [
  { id: "new", label: "New leads", description: "New WhatsApp inquiries" },
  { id: "contacted", label: "Contacted", description: "Agent replied" },
  { id: "qualified", label: "Qualified", description: "Requirements match" },
  { id: "converted", label: "Converted", description: "Won as a deal" },
  { id: "lost", label: "Lost", description: "Closed without a deal" },
];

const KANBAN_STAGE_IDS = new Set<LeadKanbanStage>(LEAD_PIPELINE_COLUMNS.map((c) => c.id));

/** Stages the kanban understands, in string form (for lookups outside the board). */
export const KNOWN_LEAD_STAGES = KANBAN_STAGE_IDS;

export function leadDisplayName(lead: Lead): string {
  return lead.contact?.full_name?.trim() || lead.contact?.phone_number || `Lead #${lead.id}`;
}

export function leadLocation(lead: Lead): string | null {
  return lead.preferred_location?.trim() || lead.contact?.city || lead.contact?.address || null;
}

/** Map the lead's score (0-1000) onto the compact card's priority badge. */
export function leadScorePriority(score: number): LeadKanbanLead["priority"] {
  if (score >= 700) return "high";
  if (score >= 350) return "medium";
  return "low";
}

/** Map a real lead stage onto the premium status union (safe after guard()). */
export function leadStageStatus(stage: Lead["stage"]): LeadKanbanStatus | null {
  return KANBAN_STAGE_IDS.has(stage as LeadKanbanStage)
    ? (stage as LeadKanbanStage as LeadKanbanStatus)
    : null;
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** Compose the "requirement" line from the real lead's property intent fields. */
export function leadRequirementText(lead: Lead): string {
  const requirement =
    lead.requirement_type === "purchase"
      ? "Buying"
      : lead.requirement_type === "rental"
        ? "Renting"
        : null;
  const property = lead.property_type?.trim() ? titleCase(lead.property_type) : null;
  const parts = [property, requirement].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" · ");
  if (lead.source_detail?.trim()) return lead.source_detail.trim();
  const source = (lead.source ?? "").trim().toLowerCase();
  if (source && !["manual", "import", "other"].includes(source)) return titleCase(lead.source ?? "");
  return "Open inquiry";
}

export function leadRequirementVisual(lead: Lead): {
  icon: LucideIcon;
  accent: LeadKanbanServiceAccent;
} {
  if (lead.requirement_type === "rental") return { icon: Key, accent: "amber" };
  if (lead.requirement_type === "purchase") return { icon: Home, accent: "sky" };
  return { icon: Building2, accent: "emerald" };
}

/** Map a real API lead onto the premium card props (null when the stage is unknown). */
export function leadToKanbanCard(lead: Lead): LeadKanbanLead | null {
  const stage = lead.stage as LeadKanbanStage;
  if (!KANBAN_STAGE_IDS.has(stage)) return null;
  const visual = leadRequirementVisual(lead);

  return {
    id: lead.id,
    stage,
    patientName: leadDisplayName(lead),
    phone: lead.contact?.phone_number || "No number",
    location: leadLocation(lead),
    service: leadRequirementText(lead),
    serviceLabel: "Requirement",
    serviceIcon: visual.icon,
    serviceAccent: visual.accent,
    priority: leadScorePriority(lead.score),
    status: stage as unknown as LeadKanbanStatus,
    unreadCount: lead.conversation?.unread_count ?? 0,
    lastMessage: lead.conversation?.last_message_preview ?? null,
    assignedStaff: lead.owner ? { name: lead.owner.name, role: null } : null,
    lastContact:
      lead.conversation?.last_message_at ?? lead.contact?.last_contacted_at ?? null,
    createdAt: lead.created_at,
    nextFollowUp:
      lead.deals?.find((deal) => deal.expected_close_date)?.expected_close_date ?? null,
    actionLabels: {
      create_appointment: "Schedule viewing",
      convert_patient: "Convert to deal",
    },
  };
}
