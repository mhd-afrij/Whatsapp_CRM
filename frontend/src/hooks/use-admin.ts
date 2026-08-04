"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTeamMember,
  createRole,
  createTeam,
  deleteRole,
  deleteTeam,
  fetchAdminUser,
  fetchAdminUsers,
  fetchPermissionCatalog,
  fetchRoles,
  fetchTeams,
  inviteUser,
  reactivateUser,
  removeTeamMember,
  resendInvitation,
  suspendUser,
  updateAdminUser,
  updateRole,
  updateTeam,
  type AdminUserListParams,
} from "@/lib/admin-api";

const usersKey = (params: AdminUserListParams) => ["admin-users", params] as const;
const teamsKey = ["teams"] as const;
const rolesKey = ["roles"] as const;
const permissionsKey = ["permissions"] as const;

export function useAdminUsers(params: AdminUserListParams) {
  return useQuery({
    queryKey: usersKey(params),
    queryFn: () => fetchAdminUsers(params),
  });
}

export function useAdminUser(id: number | null) {
  return useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => fetchAdminUser(id as number),
    enabled: id !== null,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });
}

export function useUpdateAdminUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Parameters<typeof updateAdminUser>[1] }) =>
      updateAdminUser(id, values),
    onSuccess: invalidate,
  });
}

export function useSuspendUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: suspendUser, onSuccess: invalidate });
}

export function useReactivateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: reactivateUser, onSuccess: invalidate });
}

export function useInviteUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: inviteUser, onSuccess: invalidate });
}

export function useResendInvitation() {
  return useMutation({ mutationFn: resendInvitation });
}

// --- Teams ---

export function useTeams() {
  return useQuery({ queryKey: teamsKey, queryFn: fetchTeams });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTeam,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamsKey }),
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Parameters<typeof updateTeam>[1] }) =>
      updateTeam(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamsKey }),
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamsKey }),
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, values }: { teamId: number; values: Parameters<typeof addTeamMember>[1] }) =>
      addTeamMember(teamId, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamsKey }),
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      removeTeamMember(teamId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamsKey }),
  });
}

// --- Roles & permissions ---

export function useRoles() {
  return useQuery({ queryKey: rolesKey, queryFn: fetchRoles });
}

export function usePermissionCatalog() {
  return useQuery({ queryKey: permissionsKey, queryFn: fetchPermissionCatalog });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Parameters<typeof updateRole>[1] }) =>
      updateRole(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  });
}
