import { apiClient, unwrap } from "@/lib/api-client";

export interface SlaConfig {
  id: number;
  workspace_id: number;
  name: string;
  first_response_minutes: number;
  followup_response_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlaStatus {
  has_active_sla: boolean;
  type?: "first_response" | "followup_response";
  status?: "pending" | "at_risk" | "breached" | "within_sla" | "resolved";
  deadline_at?: string;
  remaining_seconds?: number;
  percent_used?: number;
}

export async function fetchSlaConfigs(): Promise<SlaConfig[]> {
  return unwrap(apiClient.get("/sla/configs"));
}

export async function createSlaConfig(values: {
  name: string;
  first_response_minutes: number;
  followup_response_minutes: number;
}): Promise<SlaConfig> {
  return unwrap(apiClient.post("/sla/configs", values));
}

export async function updateSlaConfig(
  id: number,
  values: Partial<SlaConfig>
): Promise<SlaConfig> {
  return unwrap(apiClient.patch(`/sla/configs/${id}`, values));
}

export async function deleteSlaConfig(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/sla/configs/${id}`));
}

export async function fetchConversationSlaStatus(
  conversationId: number
): Promise<SlaStatus> {
  return unwrap(apiClient.get(`/sla/conversations/${conversationId}/status`));
}
