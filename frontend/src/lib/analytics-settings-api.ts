import { apiClient, unwrap } from "@/lib/api-client";

/**
 * Analytics Settings API - workspace-scoped configuration consumed by the
 * analytics dashboard. Endpoints are gated server-side on
 * workspace.settings.manage; the settings page is the only writer.
 */

export type AnalyticsDefaultPeriod = "today" | "yesterday" | "last_7_days" | "last_30_days" | "last_90_days";
export type AnalyticsDateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export type AgentVisibility = "super_admin" | "workspace_admins" | "managers" | "managers_plus_self" | "agent_self";
export type ConversationStartRule = "first_incoming" | "first_outgoing" | "either_direction";
export type ConversationResolutionRule = "resolved" | "closed" | "either";
export type DeletedMessagesRule = "keep" | "exclude";

/** Retention values in days; 0 means Unlimited. */
export type RawEventRetentionDays = 30 | 90 | 180 | 365 | 730 | 0;
export type AggregateRetentionDays = 90 | 365 | 730 | 1825 | 0;
export type MaxExportRangeDays = 30 | 90 | 180 | 365 | 0;

export interface AnalyticsSettings {
  // General
  analytics_enabled: boolean;
  timezone: string;
  default_period: AnalyticsDefaultPeriod;
  week_starts_on_monday: boolean;
  currency: string;
  date_format: AnalyticsDateFormat;

  // Messages
  track_sent_messages: boolean;
  track_received_messages: boolean;
  track_delivered_messages: boolean;
  track_read_messages: boolean;
  track_failed_messages: boolean;
  track_deleted_messages: boolean;
  track_response_time: boolean;
  track_first_response_time: boolean;
  track_message_volume: boolean;
  track_messages_by_agent: boolean;
  track_messages_by_account: boolean;
  track_messages_by_template: boolean;
  include_automated_messages: boolean;
  include_system_events: boolean;

  // Conversations
  track_conversations: boolean;
  track_conversation_status_counts: boolean;
  track_conversation_duration: boolean;
  track_resolution_time: boolean;
  track_assignment_time: boolean;
  track_sla_breaches: boolean;

  // Contacts & leads
  track_contacts: boolean;
  track_contact_source: boolean;
  track_contact_tags: boolean;
  track_contact_activity: boolean;
  track_contact_assignment: boolean;
  track_leads: boolean;
  track_lead_source: boolean;
  track_lead_stage_changes: boolean;
  track_lead_status_changes: boolean;
  track_lead_assignment: boolean;
  track_won_leads: boolean;
  track_lost_leads: boolean;
  track_lead_conversion: boolean;

  // Agents
  track_agent_performance: boolean;
  track_agent_assigned_conversations: boolean;
  track_agent_conversations_handled: boolean;
  track_agent_conversations_resolved: boolean;
  track_agent_first_response_time: boolean;
  track_agent_avg_response_time: boolean;
  track_agent_resolution_time: boolean;
  track_agent_messages_sent: boolean;
  track_agent_messages_received: boolean;
  track_agent_reopened_conversations: boolean;
  track_agent_sla_performance: boolean;
  track_agent_active_conversations: boolean;
  agent_leaderboard_enabled: boolean;
  agent_visibility: AgentVisibility;

  // WhatsApp accounts
  track_account_analytics: boolean;
  track_account_messages: boolean;
  track_account_conversations: boolean;
  track_account_contacts: boolean;
  track_account_leads: boolean;
  track_account_delivery_rate: boolean;
  track_account_read_rate: boolean;
  track_account_failed_messages: boolean;
  track_account_response_time: boolean;
  track_account_templates: boolean;
  track_account_message_volume: boolean;
  aggregate_accounts: boolean;

  // Templates
  track_template_analytics: boolean;
  track_template_usage: boolean;
  track_template_sent_count: boolean;
  track_template_delivered_count: boolean;
  track_template_read_count: boolean;
  track_template_failed_count: boolean;
  track_template_reply_count: boolean;
  track_template_by_account: boolean;
  track_template_by_agent: boolean;

  // Tracking rules
  conversation_start_rule: ConversationStartRule;
  conversation_resolution_rule: ConversationResolutionRule;
  bot_reply_counts_as_response: boolean;
  include_imported_messages: boolean;
  deleted_messages_rule: DeletedMessagesRule;
  count_internal_notes: boolean;

  // Retention (0 = unlimited)
  raw_event_retention_days: RawEventRetentionDays;
  aggregate_retention_days: AggregateRetentionDays;

  // Export
  allow_csv_export: boolean;
  allow_excel_export: boolean;
  allow_pdf_export: boolean;
  allow_personal_data_export: boolean;
  max_export_range_days: MaxExportRangeDays;
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
