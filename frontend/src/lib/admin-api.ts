import { apiClient, unwrap } from "@/lib/api-client";

export interface RoleRef {
  id: number;
  name: string;
  slug: string;
}

export interface TeamMembership {
  id: number;
  name: string;
  is_lead: boolean;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
  roles: RoleRef[];
  role_keys?: Array<"super_admin" | "admin" | "user">;
  status?: "ACTIVE" | "SUSPENDED";
  teams: TeamMembership[];
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  recent_activity: Array<{
    action: string;
    subject_type: string | null;
    subject_id: number | null;
    created_at: string;
  }>;
}

export interface AdminUserListMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface AdminUserListParams {
  search?: string;
  role_id?: number;
  is_active?: boolean;
  page?: number;
  per_page?: number;
}

export async function fetchAdminUsers(
  params: AdminUserListParams
): Promise<{ data: AdminUser[]; meta: AdminUserListMeta }> {
  const { data } = await apiClient.get("/workspace/users", { params });
  return { data: data.data, meta: data.meta };
}

export async function fetchAdminUser(id: number): Promise<AdminUserDetail> {
  return unwrap(apiClient.get(`/workspace/users/${id}`));
}

export async function updateAdminUser(
  id: number,
  values: Partial<{ name: string; email: string; role_id: number; team_ids: number[] }>
): Promise<AdminUser> {
  return unwrap(apiClient.patch(`/workspace/users/${id}`, values));
}

export async function suspendUser(id: number): Promise<{ id: number; is_active: boolean }> {
  return unwrap(apiClient.post(`/workspace/users/${id}/suspend`));
}

export async function reactivateUser(id: number): Promise<{ id: number; is_active: boolean }> {
  return unwrap(apiClient.post(`/workspace/users/${id}/reactivate`));
}

export async function removeWorkspaceUser(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/workspace/users/${id}`));
}

export async function inviteUser(values: {
  email: string;
  role_id: number;
  first_name?: string;
  last_name?: string;
  message?: string;
  send_email?: boolean;
}): Promise<Invitation> {
  return unwrap(apiClient.post("/workspace/invitations", values));
}

export interface Invitation {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  message: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  role: RoleRef | null;
  invited_by: { id: number; name: string; email: string } | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function fetchInvitations(): Promise<Invitation[]> {
  return unwrap(apiClient.get("/workspace/invitations"));
}

export async function updateInvitation(
  invitationId: number,
  values: Partial<{ role_id: number; message: string | null }>
): Promise<Invitation> {
  return unwrap(apiClient.patch(`/workspace/invitations/${invitationId}`, values));
}

export async function resendInvitation(invitationId: number): Promise<Invitation> {
  return unwrap(apiClient.post(`/workspace/invitations/${invitationId}/resend`));
}

export async function revokeInvitation(invitationId: number): Promise<Invitation> {
  return unwrap(apiClient.post(`/workspace/invitations/${invitationId}/revoke`));
}

// --- Teams ---

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  is_lead: boolean;
}

export interface Team {
  id: number;
  name: string;
  description: string | null;
  members: TeamMember[];
  created_at: string;
}

export async function fetchTeams(): Promise<Team[]> {
  return unwrap(apiClient.get("/teams"));
}

export async function createTeam(values: { name: string; description?: string }): Promise<Team> {
  return unwrap(apiClient.post("/teams", values));
}

export async function updateTeam(
  id: number,
  values: Partial<{ name: string; description: string }>
): Promise<Team> {
  return unwrap(apiClient.patch(`/teams/${id}`, values));
}

export async function deleteTeam(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/teams/${id}`));
}

export async function addTeamMember(
  teamId: number,
  values: { user_id: number; is_lead?: boolean }
): Promise<Team> {
  return unwrap(apiClient.post(`/teams/${teamId}/members`, values));
}

export async function removeTeamMember(teamId: number, userId: number): Promise<Team> {
  return unwrap(apiClient.delete(`/teams/${teamId}/members/${userId}`));
}

// --- Roles & Permissions ---

export interface Role {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  users_count: number;
  permissions: string[];
}

export interface PermissionEntry {
  id: number;
  name: string;
  group: string;
  description: string | null;
}

export type PermissionCatalog = Record<string, PermissionEntry[]>;

export async function fetchRoles(): Promise<Role[]> {
  return unwrap(apiClient.get("/workspace/roles"));
}

export async function createRole(values: {
  name: string;
  description?: string;
  permissions?: string[];
}): Promise<Role> {
  return unwrap(apiClient.post("/workspace/roles", values));
}

export async function updateRole(
  id: number,
  values: Partial<{ name: string; description: string; permissions: string[] }>
): Promise<Role> {
  return unwrap(apiClient.patch(`/workspace/roles/${id}`, values));
}

export async function deleteRole(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/workspace/roles/${id}`));
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalog> {
  return unwrap(apiClient.get("/permissions"));
}
