import { apiClient, unwrap } from "@/lib/api-client";
import type { LabelSummary, Paginated, UserSummary } from "@/lib/conversations-api";

// ── Types (§2, §3, §7, §10) ──────────────────────────────────────────

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "viewing"
  | "negotiation"
  | "converted"
  | "lost";

export type LeadTemperature = "cold" | "warm" | "hot";

export type LeadSource =
  | "website"
  | "lead_form"
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "referral"
  | "phone"
  | "email"
  | "manual"
  | "import"
  | "api"
  | "campaign"
  | "other";

export type LostReason =
  | "price_too_high"
  | "not_interested"
  | "purchased_elsewhere"
  | "no_response"
  | "invalid_lead"
  | "duplicate"
  | "requirement_changed"
  | "other";

export type RequirementType = "purchase" | "rental";

export interface LeadContactSummary {
  id: number;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
}

export interface LeadTeamSummary {
  id: number;
  name: string;
}

export interface Lead {
  id: number;
  workspace_id: number;
  contact_id: number;
  conversation_id: number | null;
  source: LeadSource;
  source_detail: string | null;
  campaign: string | null;
  landing_page: string | null;
  external_lead_id: string | null;
  stage: LeadStage;
  score: number;
  temperature: LeadTemperature;
  owner_user_id: number | null;
  owner: UserSummary | null;
  assigned_team_id: number | null;
  assigned_team: LeadTeamSummary | null;
  contact: LeadContactSummary | null;
  property_type: string | null;
  preferred_location: string | null;
  budget_min: number | null;
  budget_max: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  requirement_type: RequirementType | null;
  notes: string | null;
  lost_reason: LostReason | null;
  lost_notes: string | null;
  converted_at: string | null;
  labels: LabelSummary[];
  deals?: { id: number; title: string; status: string }[];
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: number;
  lead_id: number;
  created_by: number | null;
  creator: { id: number; name: string } | null;
  activity_type: string;
  subject_type: string | null;
  subject_id: number | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface LeadFilters {
  search?: string;
  stage?: LeadStage;
  temperature?: LeadTemperature;
  source?: LeadSource;
  owner_user_id?: number;
  assigned_team_id?: number;
  labels?: number[];
  budget_min?: number;
  budget_max?: number;
  property_type?: string;
  bedrooms?: number;
  requirement_type?: RequirementType;
  quick_filter?: string;
  sort?: string;
  sort_desc?: boolean;
  per_page?: number;
  page?: number;
}

export interface LeadFormValues {
  contact_id?: number;
  conversation_id?: number;
  source?: LeadSource;
  source_detail?: string;
  campaign?: string;
  landing_page?: string;
  external_lead_id?: string;
  stage?: LeadStage;
  owner_user_id?: number | null;
  assigned_team_id?: number | null;
  property_type?: string;
  preferred_location?: string;
  budget_min?: number | null;
  budget_max?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  requirement_type?: RequirementType | null;
  notes?: string;
}

export interface LeadConvertValues {
  deal_title?: string;
  pipeline_stage_id?: number;
  value_amount?: number;
  value_currency?: string;
}

export interface LeadLostValues {
  lost_reason: LostReason;
  lost_notes?: string;
}

// ── API helpers ────────────────────────────────────────────────────────

interface PaginatedApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta?: Paginated<T>["meta"] | null;
  [key: string]: unknown;
}

async function unwrapPaginated<T>(
  promise: Promise<{ data: PaginatedApiResponse<T> }>
): Promise<Paginated<T>> {
  const { data: body } = await promise;
  if (!body.success) {
    throw new Error(body.message ?? "Request failed");
  }
  return { data: body.data, meta: body.meta ?? { per_page: 0, has_more: false } };
}

// ── CRUD ───────────────────────────────────────────────────────────────

export async function fetchLeads(filters: LeadFilters): Promise<Paginated<Lead>> {
  return unwrapPaginated<Lead>(apiClient.get("/leads", { params: filters }));
}

export async function fetchLead(id: number): Promise<Lead> {
  return unwrap(apiClient.get(`/leads/${id}`));
}

export async function createLead(values: LeadFormValues): Promise<Lead> {
  return unwrap(apiClient.post("/leads", values));
}

export async function updateLead(id: number, values: LeadFormValues): Promise<Lead> {
  return unwrap(apiClient.patch(`/leads/${id}`, values));
}

export async function deleteLead(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/leads/${id}`));
}

// ── Stage / Assignment / Conversion / Lost ─────────────────────────────

export async function changeLeadStage(
  id: number,
  stage: LeadStage,
  lostReason?: LostReason,
  lostNotes?: string
): Promise<Lead> {
  return unwrap(
    apiClient.post(`/leads/${id}/stage`, {
      stage,
      lost_reason: lostReason,
      lost_notes: lostNotes,
    })
  );
}

export async function assignLead(
  id: number,
  values: { owner_user_id?: number | null; assigned_team_id?: number | null }
): Promise<Lead> {
  return unwrap(apiClient.post(`/leads/${id}/assign`, values));
}

export async function convertLead(
  id: number,
  values: LeadConvertValues = {}
): Promise<Lead> {
  return unwrap(apiClient.post(`/leads/${id}/convert`, values));
}

export async function markLeadLost(
  id: number,
  values: LeadLostValues
): Promise<Lead> {
  return unwrap(apiClient.post(`/leads/${id}/lost`, values));
}

// ── Activities / Tasks ─────────────────────────────────────────────────

export async function fetchLeadActivities(
  leadId: number,
  page = 1
): Promise<Paginated<LeadActivity>> {
  return unwrapPaginated<LeadActivity>(
    apiClient.get(`/leads/${leadId}/activities`, { params: { page, per_page: 30 } })
  );
}

export async function fetchLeadTasks(leadId: number) {
  return unwrap(apiClient.get(`/leads/${leadId}/tasks`));
}

// ── Bulk Actions (§16) ─────────────────────────────────────────────────

export async function bulkAssignLeads(
  leadIds: number[],
  values: { owner_user_id?: number | null; assigned_team_id?: number | null }
) {
  return unwrap(apiClient.post("/leads/bulk/assign", { lead_ids: leadIds, ...values }));
}

export async function bulkChangeStage(leadIds: number[], stage: LeadStage) {
  return unwrap(apiClient.post("/leads/bulk/stage", { lead_ids: leadIds, stage }));
}

export async function bulkTagLeads(
  leadIds: number[],
  labelIds: number[],
  action: "attach" | "detach"
) {
  return unwrap(
    apiClient.post("/leads/bulk/tag", { lead_ids: leadIds, label_ids: labelIds, action })
  );
}

// ── Legacy conversion helpers ──────────────────────────────────────────

export async function convertContactToLead(contactId: number): Promise<Lead> {
  return unwrap(apiClient.post(`/contacts/${contactId}/convert-to-lead`));
}

export async function convertConversationToLead(conversationId: number): Promise<Lead> {
  return unwrap(apiClient.post(`/conversations/${conversationId}/convert-to-lead`));
}
