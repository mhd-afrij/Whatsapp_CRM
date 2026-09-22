import { apiClient, unwrap } from "@/lib/api-client";

/**
 * Reports module v2 API layer. Mirrors ReportService::overview / the report
 * preference + export endpoints (backend routes /reports/*).
 */

export type ReportRange = "7d" | "30d" | "90d" | "custom";

export interface ReportFilters {
  range?: ReportRange;
  from?: string;
  to?: string;
  agent_user_id?: number;
  whatsapp_account_id?: number;
  compare?: boolean;
  page?: number;
}

export interface ReportMetric {
  value: number | null;
  previous: number | null;
  lower_is_better: boolean;
  change: number | null;
}

export interface DailyBreakdownRow {
  date: string;
  conversations: number;
  leads: number;
  converted: number;
  avg_response_minutes: number | null;
  won_count: number;
  won_value: number;
  lost_count: number;
  lost_value: number;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  per_page: number;
  total_pages: number;
  total: number;
}

export type ResponseSpeedKey = "fast" | "normal" | "slow" | "at_risk" | "no_reply";

export interface ResponseBucket {
  key: ResponseSpeedKey;
  label: string;
  count: number;
  percentage: number;
}

export interface LeaderboardAgent {
  agent_id: number;
  name: string;
  conversations: number;
  tasks: number;
  deals_won: number;
  won_value: number;
  avg_response_minutes: number | null;
}

export interface LeadStatusSlice {
  slug: string;
  name: string;
  color: string;
  type: string;
  count: number;
}

export interface LeadsBlock {
  total_created: number;
  converted: number;
  conversion_rate: number | null;
  created_by_status: LeadStatusSlice[];
  current_by_status: LeadStatusSlice[];
  total_current: number;
}

export interface ConversationAnalytics {
  by_status: Array<{ status: string; label: string; count: number }>;
  conversations_in_period: number;
  messages_sent: number;
  messages_received: number;
  total_messages: number;
}

export interface ReportOverview {
  tracked: boolean;
  unavailable_reason?: string;
  claim: "ALL" | "OWN";
  range: ReportRange;
  period: { from: string; to: string; timezone: string };
  comparison_period: { from: string; to: string } | null;
  metrics: {
    conversations: ReportMetric;
    won_value: ReportMetric;
    won_count: ReportMetric;
    lost_value: ReportMetric;
    lost_count: ReportMetric;
    win_rate: ReportMetric;
    avg_response_minutes: ReportMetric;
    leads_created: ReportMetric;
    leads_converted: ReportMetric;
    lead_conversion_rate: ReportMetric;
    task_completion_rate: ReportMetric;
  };
  weekly_revenue: Array<{ week_start: string; won: number; lost: number }>;
  deal_outcomes: {
    total: number;
    won: { count: number; value: number; pct: number };
    lost: { count: number; value: number; pct: number };
    open: { count: number; value: number; pct: number };
  };
  leads: LeadsBlock;
  conversation_analytics: ConversationAnalytics;
  trend: DailyBreakdownRow[];
  task_completion: {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    rate_percent: number;
  };
  response_speed: {
    avg_response_minutes: number | null;
    fastest_response_minutes: number | null;
    median_response_minutes: number | null;
    sample_size: number;
    no_reply_count: number;
    buckets: ResponseBucket[];
  };
  leaderboard: LeaderboardAgent[];
  daily_breakdown: Paginated<DailyBreakdownRow>;
}

export async function fetchReportOverview(filters: ReportFilters): Promise<ReportOverview> {
  return unwrap(apiClient.get("/reports/overview", { params: filters }));
}

// ── Report preferences ───────────────────────────────────────────────────────

export interface ReportPreferences {
  include_weekends: boolean;
  allow_custom_periods: boolean;
  compare_previous: boolean;
}

export interface ReportSettings {
  preferences: ReportPreferences;
  defaults: ReportPreferences;
  analytics: {
    timezone: string;
    currency: string;
    default_period: string;
    week_starts_on_monday: boolean;
    date_format: string;
  };
}

export async function fetchReportSettings(): Promise<ReportSettings> {
  return unwrap(apiClient.get("/reports/settings"));
}

export async function updateReportSettings(values: Partial<ReportPreferences>): Promise<ReportSettings> {
  return unwrap(apiClient.patch("/reports/settings", values));
}

export async function resetReportSettings(): Promise<ReportSettings> {
  return unwrap(apiClient.post("/reports/settings/reset"));
}

// ── Export lifecycle ─────────────────────────────────────────────────────────

export type ReportExportType = "contacts" | "deals" | "tasks" | "daily_metrics" | "agent_summary" | "full_pdf";

export type ReportExportStatus = "queued" | "processing" | "ready" | "failed";

export interface ReportExportRecord {
  id: number;
  type: ReportExportType;
  status: ReportExportStatus;
  filters: { from?: string | null; to?: string | null } | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  row_count: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function fetchReportExports(): Promise<ReportExportRecord[]> {
  return unwrap(apiClient.get("/reports/exports"));
}

export async function queueReportExport(type: ReportExportType): Promise<ReportExportRecord> {
  return unwrap(apiClient.post("/reports/exports", { type }));
}

export async function retryReportExport(id: number): Promise<ReportExportRecord> {
  return unwrap(apiClient.post(`/reports/exports/${id}/retry`));
}

export async function downloadReportExport(id: number): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/reports/exports/${id}/download`, { responseType: "blob" });
  return response.data;
}