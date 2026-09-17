import { apiClient, unwrap } from "@/lib/api-client";

export interface LeadSettingsGeneral {
  default_status_id: number | null;
  default_priority: "low" | "normal" | "high" | "urgent";
  default_owner_type: "none" | "current_user" | "user" | "team";
  default_owner_id: number | null;
  auto_create_from_whatsapp_contact: boolean;
  auto_create_from_conversation: boolean;
  prevent_duplicate_active_leads: boolean;
  duplicate_fields: { contact: boolean; phone: boolean; email: boolean };
  require_owner: boolean;
  require_source: boolean;
  allow_manual_creation: boolean;
  allow_deletion: boolean;
}

export type AssignmentStrategy =
  | "round_robin"
  | "least_assigned"
  | "least_active"
  | "random"
  | "user"
  | "team";

export interface LeadSettingsAssignment {
  enabled: boolean;
  strategy: AssignmentStrategy;
  user_ids: number[];
  team_id: number | null;
  skip_offline: boolean;
  skip_on_leave: boolean;
  period: "today" | "week" | "month";
  team_strategy: "round_robin" | "least_assigned";
  max_per_user: number;
  when_limit_reached: "unassigned" | "next_available" | "anyway";
}

export interface ScoreRange {
  name: string;
  min: number;
  max: number;
  color: string;
}

export interface LeadSettingsScoring {
  enabled: boolean;
  ranges: ScoreRange[];
}

export interface LeadSettingsConversion {
  enabled: boolean;
  create: { relationship: boolean; deal: boolean; task: boolean; follow_up: boolean };
  create_deal_automatically: boolean;
  default_pipeline_id: number | null;
  default_stage_id: number | null;
  deal_title_template: string;
  deal_value: "estimated" | "blank" | "fixed";
  fixed_value: number | null;
  converted_status_id: number | null;
  copy: {
    owner: boolean;
    source: boolean;
    notes: boolean;
    tags: boolean;
    estimated_value: boolean;
    custom_fields: boolean;
  };
  after_conversion: "keep" | "archive" | "hide";
}

export interface LeadSettings {
  general: LeadSettingsGeneral;
  assignment: LeadSettingsAssignment;
  scoring: LeadSettingsScoring;
  conversion: LeadSettingsConversion;
}

export interface LeadStatus {
  id: number;
  workspace_id: number;
  name: string;
  slug: string;
  color: string;
  type: "open" | "won" | "lost";
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  leads_count?: number;
  created_at: string;
  updated_at: string;
}

export interface LeadStatusFormValues {
  name: string;
  type: "open" | "won" | "lost";
  color?: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface LeadSource {
  id: number;
  workspace_id: number;
  name: string;
  slug: string;
  color: string;
  icon: string | null;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  leads_count?: number;
  created_at: string;
  updated_at: string;
}

export interface LeadSourceFormValues {
  name: string;
  color?: string;
  icon?: string | null;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: string | number | boolean | null;
}

export interface RuleAction {
  type: string;
  value: string | number | boolean | null;
}

export interface LeadAssignmentRule {
  id: number;
  workspace_id: number;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeadScoringRule {
  id: number;
  workspace_id: number;
  name: string;
  conditions: RuleCondition[];
  points: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AutomationTriggerType =
  | "lead_created"
  | "lead_assigned"
  | "status_changed"
  | "source_changed"
  | "score_changed"
  | "becomes_qualified"
  | "becomes_inactive"
  | "not_contacted_after"
  | "no_response_after"
  | "converted";

export interface LeadAutomation {
  id: number;
  workspace_id: number;
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_value: string | null;
  conditions: RuleCondition[] | null;
  actions: RuleAction[];
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchLeadSettings(): Promise<{ settings: LeadSettings }> {
  return unwrap(apiClient.get("/settings/leads"));
}

export async function updateLeadSettings(values: Partial<LeadSettings>): Promise<{ settings: LeadSettings }> {
  return unwrap(apiClient.patch("/settings/leads", values));
}

export async function updateLeadSettingsSection(
  section: "assignment" | "scoring" | "conversion",
  values: Record<string, unknown>
): Promise<{ settings: LeadSettings }> {
  return unwrap(apiClient.patch(`/settings/leads/${section}`, values));
}

// --- Statuses ---

export async function fetchLeadStatuses(): Promise<LeadStatus[]> {
  return unwrap(apiClient.get("/settings/lead-statuses"));
}

export async function createLeadStatus(values: LeadStatusFormValues): Promise<LeadStatus> {
  return unwrap(apiClient.post("/settings/lead-statuses", values));
}

export async function updateLeadStatus(
  id: number,
  values: Partial<LeadStatusFormValues>
): Promise<LeadStatus> {
  return unwrap(apiClient.patch(`/settings/lead-statuses/${id}`, values));
}

export async function deleteLeadStatus(id: number, replacementStatusId: number): Promise<null> {
  return unwrap(apiClient.delete(`/settings/lead-statuses/${id}`, { data: { replacement_status_id: replacementStatusId } }));
}

export async function reorderLeadStatuses(ids: number[]): Promise<null> {
  return unwrap(apiClient.post("/settings/lead-statuses/reorder", { ids }));
}

// --- Sources ---

export async function fetchLeadSources(): Promise<LeadSource[]> {
  return unwrap(apiClient.get("/settings/lead-sources"));
}

export async function createLeadSource(values: LeadSourceFormValues): Promise<LeadSource> {
  return unwrap(apiClient.post("/settings/lead-sources", values));
}

export async function updateLeadSource(id: number, values: Partial<LeadSourceFormValues>): Promise<LeadSource> {
  return unwrap(apiClient.patch(`/settings/lead-sources/${id}`, values));
}

export async function deleteLeadSource(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/settings/lead-sources/${id}`));
}

export async function reorderLeadSources(ids: number[]): Promise<null> {
  return unwrap(apiClient.post("/settings/lead-sources/reorder", { ids }));
}

// --- Assignment rules ---

export interface LeadAssignmentRuleFormValues {
  name: string;
  priority?: number;
  is_active?: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export async function fetchLeadAssignmentRules(): Promise<LeadAssignmentRule[]> {
  return unwrap(apiClient.get("/settings/lead-assignment-rules"));
}

export async function createLeadAssignmentRule(values: LeadAssignmentRuleFormValues): Promise<LeadAssignmentRule> {
  return unwrap(apiClient.post("/settings/lead-assignment-rules", values));
}

export async function updateLeadAssignmentRule(
  id: number,
  values: Partial<LeadAssignmentRuleFormValues>
): Promise<LeadAssignmentRule> {
  return unwrap(apiClient.patch(`/settings/lead-assignment-rules/${id}`, values));
}

export async function deleteLeadAssignmentRule(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/settings/lead-assignment-rules/${id}`));
}

export async function reorderLeadAssignmentRules(ids: number[]): Promise<null> {
  return unwrap(apiClient.post("/settings/lead-assignment-rules/reorder", { ids }));
}

// --- Scoring rules ---

export interface LeadScoringRuleFormValues {
  name: string;
  points: number;
  is_active?: boolean;
  conditions?: RuleCondition[];
}

export async function fetchLeadScoringRules(): Promise<LeadScoringRule[]> {
  return unwrap(apiClient.get("/settings/lead-scoring-rules"));
}

export async function createLeadScoringRule(values: LeadScoringRuleFormValues): Promise<LeadScoringRule> {
  return unwrap(apiClient.post("/settings/lead-scoring-rules", values));
}

export async function updateLeadScoringRule(
  id: number,
  values: Partial<LeadScoringRuleFormValues>
): Promise<LeadScoringRule> {
  return unwrap(apiClient.patch(`/settings/lead-scoring-rules/${id}`, values));
}

export async function deleteLeadScoringRule(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/settings/lead-scoring-rules/${id}`));
}

// --- Automations ---

export interface LeadAutomationFormValues {
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_value?: string | null;
  conditions?: RuleCondition[] | null;
  actions: RuleAction[];
  is_active?: boolean;
}

export const AUTOMATION_TRIGGER_LABELS: Array<{ value: AutomationTriggerType; label: string }> = [
  { value: "lead_created", label: "Lead created" },
  { value: "lead_assigned", label: "Lead assigned" },
  { value: "status_changed", label: "Status changed" },
  { value: "source_changed", label: "Source changed" },
  { value: "score_changed", label: "Score changed" },
  { value: "becomes_qualified", label: "Becomes qualified" },
  { value: "becomes_inactive", label: "Becomes inactive" },
  { value: "not_contacted_after", label: "Not contacted after X" },
  { value: "no_response_after", label: "No response after X" },
  { value: "converted", label: "Lead converted" },
];

export async function fetchLeadAutomations(): Promise<LeadAutomation[]> {
  return unwrap(apiClient.get("/settings/lead-automations"));
}

export async function createLeadAutomation(values: LeadAutomationFormValues): Promise<LeadAutomation> {
  return unwrap(apiClient.post("/settings/lead-automations", values));
}

export async function updateLeadAutomation(
  id: number,
  values: Partial<LeadAutomationFormValues>
): Promise<LeadAutomation> {
  return unwrap(apiClient.patch(`/settings/lead-automations/${id}`, values));
}

export async function deleteLeadAutomation(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/settings/lead-automations/${id}`));
}

export async function setLeadAutomationActive(id: number, active: boolean): Promise<LeadAutomation> {
  return unwrap(apiClient.post(`/settings/lead-automations/${id}/${active ? "enable" : "disable"}`));
}