import { apiClient, unwrap } from "@/lib/api-client";
import type { Deal, DealContactSummary } from "@/lib/deals-api";
import type { UserSummary } from "@/lib/conversations-api";

export interface PipelineStage {
  id: number;
  pipeline_id: number;
  name: string;
  position: number;
  probability_percent: number | null;
  is_won_stage: boolean;
  is_lost_stage: boolean;
}

export interface Pipeline {
  id: number;
  workspace_id: number;
  name: string;
  is_default: boolean;
  stages: PipelineStage[];
}

export interface PipelineStageFormValues {
  name?: string;
  position?: number;
  probability_percent?: number | null;
  is_won_stage?: boolean;
  is_lost_stage?: boolean;
}

export interface PipelineFormValues {
  name: string;
  is_default?: boolean;
}

export interface BoardDeal extends Omit<Deal, "contact" | "owner"> {
  contact: DealContactSummary | null;
  owner: UserSummary | null;
}

export interface BoardStage {
  id: number;
  name: string;
  position: number;
  probability_percent: number | null;
  is_won_stage: boolean;
  is_lost_stage: boolean;
  deal_count: number;
  total_value: number;
  deals: BoardDeal[];
}

export interface PipelineBoard {
  pipeline: { id: number; name: string; is_default: boolean };
  stages: BoardStage[];
  overall_total: number;
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  return unwrap(apiClient.get("/pipelines"));
}

export async function fetchPipeline(id: number): Promise<Pipeline> {
  return unwrap(apiClient.get(`/pipelines/${id}`));
}

export async function fetchPipelineBoard(id: number): Promise<PipelineBoard> {
  return unwrap(apiClient.get(`/pipelines/${id}/board`));
}

export async function createPipeline(values: PipelineFormValues): Promise<Pipeline> {
  return unwrap(apiClient.post("/pipelines", values));
}

export async function updatePipeline(id: number, values: Partial<PipelineFormValues>): Promise<Pipeline> {
  return unwrap(apiClient.patch(`/pipelines/${id}`, values));
}

export async function deletePipeline(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/pipelines/${id}`));
}

export async function createStage(pipelineId: number, values: PipelineStageFormValues): Promise<PipelineStage> {
  return unwrap(apiClient.post(`/pipelines/${pipelineId}/stages`, values));
}

export async function updateStage(
  pipelineId: number,
  stageId: number,
  values: Partial<PipelineStageFormValues>
): Promise<PipelineStage> {
  return unwrap(apiClient.patch(`/pipelines/${pipelineId}/stages/${stageId}`, values));
}

export async function deleteStage(pipelineId: number, stageId: number): Promise<null> {
  return unwrap(apiClient.delete(`/pipelines/${pipelineId}/stages/${stageId}`));
}
