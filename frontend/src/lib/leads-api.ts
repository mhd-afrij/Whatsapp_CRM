import { apiClient, unwrap } from '@/lib/api-client';
import type { LabelSummary, Paginated, UserSummary } from '@/lib/conversations-api';
import type { DealSummary } from '@/lib/contacts-api';

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'lost' | 'converted' | string;
export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface Lead {
  id: number;
  workspace_id: number;
  contact_id: number;
  stage: LeadStage;
  temperature: LeadTemperature;
  score: number;
  source: string;
  notes: string | null;
  owner_user_id: number | null;
  owner: UserSummary | null;
  contact: { id: number; full_name: string | null; phone_number: string | null } | null;
  labels: LabelSummary[];
  deals?: DealSummary[];
  converted_at: string | null;
  created_at: string;
}

export interface LeadFilters { search?: string; stage?: LeadStage; temperature?: LeadTemperature; per_page?: number; page?: number; }
export interface LeadFormValues { contact_id: number; stage?: LeadStage; temperature?: LeadTemperature; score?: number; source?: string; notes?: string | null; }

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
