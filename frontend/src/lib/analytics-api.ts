import { apiClient, unwrap } from "@/lib/api-client";

export interface DashboardFilters {
  from?: string;
  to?: string;
}

export interface AnalyticsFilters extends DashboardFilters {
  agent_user_id?: number;
  pipeline_id?: number;
  status?: string;
}

export interface DashboardSummary {
  range: { from: string; to: string };
  conversations: { new: number; open: number; closed: number; unassigned: number };
  response_time: {
    avg_first_response_minutes: number | null;
    avg_response_minutes: number | null;
    sample_size: number;
  };
  contacts: { new: number };
  leads: { new: number; converted: number; conversion_rate_percent: number };
  deals: { pipeline_value: number; won_value: number; lost_count: number };
  tasks: { overdue: number };
  agent_workload: Array<{ user_id: number; name: string; open_conversations: number; open_tasks: number }>;
}

export async function fetchDashboardSummary(filters: DashboardFilters): Promise<DashboardSummary> {
  return unwrap(apiClient.get("/dashboard/summary", { params: filters }));
}

export interface VolumePoint {
  date: string;
  count: number;
}

export async function fetchConversationVolume(filters: AnalyticsFilters): Promise<VolumePoint[]> {
  return unwrap(apiClient.get("/analytics/conversation-volume", { params: filters }));
}

export interface ResponseTimePoint {
  date: string;
  avg_response_minutes: number | null;
}

export async function fetchResponseTimeTrend(filters: AnalyticsFilters): Promise<ResponseTimePoint[]> {
  return unwrap(apiClient.get("/analytics/response-time-trend", { params: filters }));
}

export interface LeadFunnelPoint {
  status: string;
  count: number;
}

export async function fetchLeadFunnel(filters: AnalyticsFilters): Promise<LeadFunnelPoint[]> {
  return unwrap(apiClient.get("/analytics/lead-funnel", { params: filters }));
}

export interface PipelineStagePoint {
  stage_id: number | null;
  stage_name: string;
  count: number;
  value: number;
}

export async function fetchPipelineStageDistribution(filters: AnalyticsFilters): Promise<PipelineStagePoint[]> {
  return unwrap(apiClient.get("/analytics/pipeline-stage-distribution", { params: filters }));
}

export interface WonVsLostPoint {
  date: string;
  won_count: number;
  won_value: number;
  lost_count: number;
  lost_value: number;
}

export async function fetchWonVsLost(filters: AnalyticsFilters): Promise<WonVsLostPoint[]> {
  return unwrap(apiClient.get("/analytics/won-vs-lost", { params: filters }));
}

export interface AgentPerformancePoint {
  user_id: number;
  name: string;
  conversations_handled: number;
  tasks_completed: number;
}

export async function fetchAgentPerformance(filters: AnalyticsFilters): Promise<AgentPerformancePoint[]> {
  return unwrap(apiClient.get("/analytics/agent-performance", { params: filters }));
}

export interface TaskCompletionRate {
  total: number;
  completed: number;
  rate_percent: number;
}

export async function fetchTaskCompletionRate(filters: AnalyticsFilters): Promise<TaskCompletionRate> {
  return unwrap(apiClient.get("/analytics/task-completion-rate", { params: filters }));
}

export type ReportExportType = "contacts" | "leads" | "deals" | "tasks";

export async function requestReportExport(
  type: ReportExportType,
  filters: DashboardFilters
): Promise<{ status: string }> {
  return unwrap(apiClient.post("/reports/export", { type, ...filters }));
}
