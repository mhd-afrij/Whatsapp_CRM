import { apiClient, unwrap } from "@/lib/api-client";

export interface AuditLogActor {
  id: number;
  name: string;
  email: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  subject_type: string | null;
  subject_id: number | null;
  actor: AuditLogActor | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogDetail extends AuditLogEntry {
  user_agent: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changes: Record<string, unknown> | null;
}

export interface AuditLogListMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface AuditLogListParams {
  date_from?: string;
  date_to?: string;
  user_id?: number;
  action?: string;
  subject_type?: string;
  page?: number;
  per_page?: number;
}

export async function fetchAuditLogs(
  params: AuditLogListParams
): Promise<{ data: AuditLogEntry[]; meta: AuditLogListMeta }> {
  const { data } = await apiClient.get("/audit-logs", { params });
  return { data: data.data, meta: data.meta };
}

export async function fetchAuditLog(id: number): Promise<AuditLogDetail> {
  return unwrap(apiClient.get(`/audit-logs/${id}`));
}
