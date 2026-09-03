import { apiClient, unwrap, type ApiResponse } from "@/lib/api-client";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "failed"
  | "cancelled";

export interface CampaignAudienceFilter {
  labels: number[];
  statuses: string[];
  search?: string;
}

export interface Campaign {
  id: number;
  workspace_id: number;
  name: string;
  description: string | null;
  message_template_id: number | null;
  message_content: string;
  audience_filter: CampaignAudienceFilter | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  creator?: { id: number; name: string } | null;
}

export interface CampaignFormValues {
  name: string;
  description?: string | null;
  message_template_id?: number | null;
  message_content: string;
  labels: number[];
  statuses: string[];
  search?: string;
  scheduled_at?: string | null;
}

export interface AudiencePreview {
  count: number;
  sample: Array<{ id: number; full_name: string; phone_number: string }>;
}

export interface CampaignAnalytics {
  totals: {
    targets: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  completion_rate: number | null;
  recent_failures: Array<{
    id: number;
    contact_name: string | null;
    phone_number: string;
    error: string | null;
  }>;
}

export interface CampaignMessageRow {
  id: number;
  campaign_id: number;
  contact_id: number;
  phone_number: string;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  sent_at: string | null;
  contact?: { id: number; full_name: string } | null;
}

/** unwrap variant that tolerates `data: null` success bodies (e.g. DELETE). */
async function unwrapNullable<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T | null> {
  const { data: body } = await promise;
  if (body && typeof body === "object" && "success" in body && body.success === false) {
    throw new Error("message" in body ? String(body.message) : "Request failed");
  }
  return (body as { data: T | null }).data ?? null;
}

function toFilterPayload(values: CampaignFormValues) {
  return {
    name: values.name,
    description: values.description || null,
    message_template_id: values.message_template_id ?? null,
    message_content: values.message_content,
    labels: values.labels,
    statuses: values.statuses,
    ...(values.search ? { search: values.search } : {}),
    ...(values.scheduled_at ? { scheduled_at: values.scheduled_at } : {}),
  };
}

export async function fetchCampaigns(params?: {
  status?: CampaignStatus;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<Campaign[]> {
  const res = await apiClient.get<ApiResponse<Campaign[]>>("/campaigns", { params });
  const body = res.data;
  if (body.success === false) throw new Error(body.message);
  return body.data ?? [];
}

export async function fetchCampaign(id: number): Promise<Campaign> {
  return unwrap(apiClient.get(`/campaigns/${id}`));
}

export async function createCampaign(values: CampaignFormValues): Promise<Campaign> {
  return unwrap(apiClient.post("/campaigns", toFilterPayload(values)));
}

export async function updateCampaign(
  id: number,
  values: Partial<CampaignFormValues>
): Promise<Campaign> {
  return unwrap(apiClient.patch(`/campaigns/${id}`, toFilterPayload(values as CampaignFormValues)));
}

export async function deleteCampaign(id: number): Promise<null> {
  return unwrapNullable(apiClient.delete<ApiResponse<null>>(`/campaigns/${id}`));
}

export async function sendCampaign(id: number): Promise<Campaign> {
  return unwrap(apiClient.post(`/campaigns/${id}/send`));
}

export async function cancelCampaign(id: number): Promise<Campaign> {
  return unwrap(apiClient.post(`/campaigns/${id}/cancel`));
}

export async function previewCampaignAudience(filter: {
  labels: number[];
  statuses: string[];
  search?: string;
}): Promise<AudiencePreview> {
  return unwrap(
    apiClient.post("/campaigns/preview-audience", {
      labels: filter.labels,
      statuses: filter.statuses,
      ...(filter.search ? { search: filter.search } : {}),
    })
  );
}

export async function fetchCampaignAnalytics(id: number): Promise<CampaignAnalytics> {
  return unwrap(apiClient.get(`/campaigns/${id}/analytics`));
}

export async function fetchCampaignMessages(params: {
  id: number;
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<CampaignMessageRow[]> {
  const { id, ...query } = params;
  const res = await apiClient.get<ApiResponse<CampaignMessageRow[]>>(`/campaigns/${id}/messages`, {
    params: query,
  });
  const body = res.data;
  if (body.success === false) throw new Error(body.message);
  return body.data ?? [];
}
