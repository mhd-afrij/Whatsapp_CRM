export interface TeamMember {
  id: number;
  uuid: string;
  name: string;
  email: string;
  avatar_path: string | null;
  status: string;
  last_login_at: string | null;
  roles: { id: number; name: string; slug: string }[];
}

export interface AuditLogEntry {
  id: number;
  workspace_id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string;
  created_at: string;
  user: { id: number; name: string; email: string } | null;
}

export interface PermissionDefinition {
  id: number;
  key: string;
  description: string;
}

export interface RoleWithPermissions {
  id: number;
  workspace_id: number | null;
  name: string;
  slug: string;
  is_system_role: boolean;
  permissions: PermissionDefinition[];
}

export interface WorkspaceSummary {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
}

export interface DashboardSummary {
  workspace: WorkspaceSummary | null;
  totals: {
    teamMembers: number;
    activeMembers: number;
    roles: number;
    permissions: number;
    auditEvents: number;
  };
  recentMembers: TeamMember[];
  recentAuditEvents: AuditLogEntry[];
}

export interface SyncServiceStatus {
  status: "healthy" | "degraded" | "unavailable";
  service: string;
  session: "linked" | "unlinked" | "connecting";
  device_name: string | null;
  linked_at: string | null;
  last_seen_at: string | null;
  qr_pending: boolean;
  qr_code: string | null;
}

export interface Lead {
  id: number;
  workspace_id: number;
  title: string;
  customer_name: string;
  value: string | null;
  stage: string;
  agent_name: string | null;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  workspace_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  stage: string;
  agent_name: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskItem {
  id: number;
  workspace_id: number;
  assignee_id: number | null;
  title: string;
  due_at: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "completed" | "cancelled";
  assignee?: { id: number; name: string; email: string } | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: number;
  workspace_id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  kind: string;
  created_at: string;
  updated_at: string;
}
