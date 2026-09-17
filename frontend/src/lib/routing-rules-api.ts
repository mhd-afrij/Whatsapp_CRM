import { apiClient, unwrap } from "@/lib/api-client";

export interface RoutingRuleCondition {
  key: string;
  operator: string;
  value: string | number | boolean | null;
}

export interface RoutingRuleAction {
  type: string;
  value: string | number | boolean | null;
}

export interface RoutingRule {
  id: number;
  workspace_id: number;
  name: string;
  is_active: boolean;
  priority: number;
  conditions: RoutingRuleCondition[] | null;
  actions: RoutingRuleAction[] | null;
  created_at: string;
  updated_at: string;
}

export interface RoutingRuleFormValues {
  name: string;
  is_active?: boolean;
  priority?: number;
  conditions?: RoutingRuleCondition[] | null;
  actions?: RoutingRuleAction[] | null;
}

export async function fetchRoutingRules(): Promise<RoutingRule[]> {
  return unwrap(apiClient.get("/settings/inbox/routing-rules"));
}

export async function createRoutingRule(values: RoutingRuleFormValues): Promise<RoutingRule> {
  return unwrap(apiClient.post("/settings/inbox/routing-rules", values));
}

export async function updateRoutingRule(
  id: number,
  values: Partial<RoutingRuleFormValues>
): Promise<RoutingRule> {
  return unwrap(apiClient.patch(`/settings/inbox/routing-rules/${id}`, values));
}

export async function deleteRoutingRule(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/settings/inbox/routing-rules/${id}`));
}