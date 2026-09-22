import { apiClient, unwrap } from "@/lib/api-client";

/**
 * Analytics Settings API - workspace-scoped configuration consumed by the
 * Reports module and the Dashboard's analytics widgets. Endpoints are gated
 * server-side on workspace.settings.manage; this settings page is the only
 * writer.
 *
 * Only settings the current system actually reads are typed here:
 *  - Reports module (ReportService): analytics_enabled, timezone, currency,
 *    default_period, week_starts_on_monday, date_format.
 *  - Dashboard analytics widgets (/analytics/*): analytics_enabled plus the
 *    six `track_*` toggles below. Each endpoint returns "unavailable" when its
 *    topic switch is off.
 * The backend row carries more columns; they are legacy/aspirational config
 * with no consumer and are intentionally left out of the UI.
 */

export type AnalyticsDefaultPeriod = "today" | "yesterday" | "last_7_days" | "last_30_days" | "last_90_days";
export type AnalyticsDateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export interface AnalyticsSettings {
  // General (consumed by the Reports module)
  analytics_enabled: boolean;
  timezone: string;
  default_period: AnalyticsDefaultPeriod;
  week_starts_on_monday: boolean;
  currency: string;
  date_format: AnalyticsDateFormat;

  // Dashboard analytics widgets - per-topic availability switches.
  track_conversations: boolean;
  track_response_time: boolean;
  track_leads: boolean;
  track_won_leads: boolean;
  track_lost_leads: boolean;
  track_agent_performance: boolean;
}

export interface AnalyticsSettingsResult {
  settings: AnalyticsSettings;
  defaults: AnalyticsSettings;
}

export async function fetchAnalyticsSettings(): Promise<AnalyticsSettingsResult> {
  return unwrap(apiClient.get("/settings/analytics"));
}

export async function updateAnalyticsSettings(
  values: Partial<AnalyticsSettings>
): Promise<AnalyticsSettingsResult> {
  return unwrap(apiClient.patch("/settings/analytics", values));
}

export async function resetAnalyticsSettings(): Promise<AnalyticsSettingsResult> {
  return unwrap(apiClient.post("/settings/analytics/reset"));
}