import { apiClient, unwrap } from "@/lib/api-client";
import type { LabelSummary, Paginated, UserSummary } from "@/lib/conversations-api";

export type LeadStatus = "new" | "contacted" | "qualified" | "disqualified" | "converted";
export type LeadSource = "whatsapp" | "manual" | "import" | "other";

export interface LeadContactSummary {
  id: number;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
}

export interface Lead {
  id: number;
  workspace_id: number;
  contact_id: number;
  conversation_id: number | null;
  source: LeadSource;
  status: LeadStatus;
  owner_user_id: number | null;
  owner: UserSummary | null;
  contact: LeadContactSummary | null;
  notes: string | null;
  labels: LabelSummary[];
  deals?: { id: number; title: string; status: string }[];
  created_at: string;
  updated_at: string;
}

export interface LeadFilters {
  status?: LeadStatus;
  source?: LeadSource;
  owner_user_id?: number;
  per_page?: number;
  page?: number;
  /** Any-match (OR) label filter. */
  labels?: number[];
}

export interface LeadFormValues {
  contact_id?: number;
  source?: LeadSource;
  status?: LeadStatus;
  owner_user_id?: number | null;
  notes?: string | null;
}

interface PaginatedApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta?: Paginated<T>["meta"] | null;
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

export async function convertContactToLead(contactId: number): Promise<Lead> {
  return unwrap(apiClient.post(`/contacts/${contactId}/convert-to-lead`));
}

export async function convertConversationToLead(conversationId: number): Promise<Lead> {
  return unwrap(apiClient.post(`/conversations/${conversationId}/convert-to-lead`));
}
