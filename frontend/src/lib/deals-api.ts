import { apiClient, unwrap } from "@/lib/api-client";
import type { LabelSummary, Paginated, UserSummary } from "@/lib/conversations-api";

export type DealStatus = "open" | "won" | "lost";

export interface DealStageSummary {
  id: number;
  name: string;
  position: number;
  probability_percent: number | null;
  is_won_stage: boolean;
  is_lost_stage: boolean;
}

export interface DealPipelineSummary {
  id: number;
  name: string;
}

export interface DealContactSummary {
  id: number;
  full_name: string | null;
  phone_number: string | null;
}

export interface DealStageHistoryEntry {
  id: number;
  from_stage_id: number | null;
  to_stage_id: number;
  moved_at: string;
  from_stage: DealStageSummary | null;
  to_stage: DealStageSummary | null;
  moved_by: UserSummary | null;
}

export interface Deal {
  id: number;
  workspace_id: number;
  contact_id: number;
  pipeline_id: number;
  pipeline_stage_id: number;
  title: string;
  value_amount: string | number | null;
  value_currency: string;
  probability_percent: number | null;
  owner_user_id: number | null;
  owner: UserSummary | null;
  contact: DealContactSummary | null;
  pipeline: DealPipelineSummary | null;
  stage: DealStageSummary | null;
  expected_close_date: string | null;
  status: DealStatus;
  lost_reason: string | null;
  closed_at: string | null;
  stage_history?: DealStageHistoryEntry[];
  labels: LabelSummary[];
  created_at: string;
  updated_at: string;
}

export interface DealFilters {
  pipeline_id?: number;
  pipeline_stage_id?: number;
  status?: DealStatus;
  owner_user_id?: number;
  per_page?: number;
  page?: number;
  /** Any-match (OR) label filter. */
  labels?: number[];
}

export interface DealFormValues {
  contact_id?: number;
  pipeline_id?: number;
  pipeline_stage_id?: number;
  title?: string;
  value_amount?: number | null;
  value_currency?: string;
  probability_percent?: number | null;
  owner_user_id?: number | null;
  expected_close_date?: string | null;
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
  // Backend omits `success` on 2xx bodies — only an explicit false is a failure.
  if (body.success === false || !body.data) {
    throw new Error(body.message ?? "Request failed");
  }
  return { data: body.data, meta: body.meta ?? { per_page: 0, has_more: false } };
}

export async function fetchDeals(filters: DealFilters): Promise<Paginated<Deal>> {
  return unwrapPaginated<Deal>(apiClient.get("/deals", { params: filters }));
}

export async function fetchDeal(id: number): Promise<Deal> {
  return unwrap(apiClient.get(`/deals/${id}`));
}

export async function createDeal(values: DealFormValues): Promise<Deal> {
  return unwrap(apiClient.post("/deals", values));
}

export async function updateDeal(id: number, values: DealFormValues): Promise<Deal> {
  return unwrap(apiClient.patch(`/deals/${id}`, values));
}

export async function moveDealStage(id: number, pipelineStageId: number): Promise<Deal> {
  return unwrap(apiClient.patch(`/deals/${id}/stage`, { pipeline_stage_id: pipelineStageId }));
}

export async function markDealWon(id: number): Promise<Deal> {
  return unwrap(apiClient.post(`/deals/${id}/won`));
}

export async function markDealLost(id: number, lostReason: string): Promise<Deal> {
  return unwrap(apiClient.post(`/deals/${id}/lost`, { lost_reason: lostReason }));
}

export async function deleteDeal(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/deals/${id}`));
}
