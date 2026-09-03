import { apiClient, unwrap } from '@/lib/api-client';
import type { LabelSummary, Paginated, UserSummary } from '@/lib/conversations-api';

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'lost' | 'converted' | string;
export type LeadRequirement = 'purchase' | 'rental';

/** WhatsApp conversation summary attached to a lead (eager-loaded on index). */
export interface LeadConversation {
  id: number;
  status?: 'open' | 'pending' | 'closed';
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  assigned_user_id?: number | null;
  assigned_team_id?: number | null;
}

export interface LeadContact {
  id: number;
  full_name: string | null;
  phone_number: string | null;
  email?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  last_contacted_at?: string | null;
}

export interface Lead {
  id: number;
  workspace_id: number;
  contact_id: number;
  conversation_id: number | null;
  stage: LeadStage;
  score: number;
  source: string;
  source_detail: string | null;
  campaign: string | null;
  landing_page: string | null;
  external_lead_id: string | null;
  property_type: string | null;
  preferred_location: string | null;
  budget_min: string | number | null;
  budget_max: string | number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  requirement_type: LeadRequirement | null;
  notes: string | null;
  owner_user_id: number | null;
  assigned_team_id: number | null;
  owner: UserSummary | null;
  contact: LeadContact | null;
  conversation: LeadConversation | null;
  labels: LabelSummary[];
  deals?: DealSummary[];
  converted_at: string | null;
  created_at: string;
  lost_reason?: string | null;
  lost_notes?: string | null;
}

interface DealSummary {
  id: number;
  title: string;
  status: string;
  value_amount: string | number | null;
  value_currency: string;
  expected_close_date?: string | null;
}

export interface LeadFilters { search?: string; stage?: LeadStage; per_page?: number; page?: number; }
export interface LeadFormValues { contact_id: number; stage?: LeadStage; score?: number; source?: string; notes?: string | null; }

export async function fetchLeads(filters: LeadFilters): Promise<Paginated<Lead>> {
  const response = await apiClient.get('/leads', { params: filters });
  const body = response.data as { data: Lead[]; meta?: Paginated<Lead>['meta']; message?: string; success?: boolean };
  if (body.success === false) throw new Error(body.message ?? 'Unable to load leads');
  return { data: body.data, meta: body.meta ?? { per_page: 0, has_more: false } };
}

export async function fetchLead(id: number): Promise<Lead> { return unwrap(apiClient.get(`/leads/${id}`)); }
export async function createLead(values: LeadFormValues): Promise<Lead> { return unwrap(apiClient.post('/leads', values)); }
export async function updateLead(id: number, values: Partial<LeadFormValues>): Promise<Lead> { return unwrap(apiClient.patch(`/leads/${id}`, values)); }
export async function deleteLead(id: number): Promise<null> { return unwrap(apiClient.delete(`/leads/${id}`)); }
