"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { authFetch } from "@/stores/auth-store";
import type { PermissionDefinition, RoleWithPermissions } from "@/types/admin";

export default function RolesPage() {
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => authFetch<RoleWithPermissions[]>("/roles"),
  });
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => authFetch<PermissionDefinition[]>("/permissions"),
  });

  const isLoading = rolesQuery.isLoading || permissionsQuery.isLoading;
  const isError = rolesQuery.isError || permissionsQuery.isError;
  const roles = rolesQuery.data;
  const permissions = permissionsQuery.data;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Read-only permission matrix. Custom role management lands in Phase 7."
      />

      {isLoading && (
        <div className="h-64 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
      )}

      {isError && (
        <EmptyState
          icon={ShieldCheck}
          title="Couldn't load roles"
          description="You may not have the roles.manage permission, or the API is unreachable."
        />
      )}

      {roles && permissions && (
        <div className="rounded-[10px] border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3 sticky left-0 bg-surface">Permission</th>
                {roles.map((role) => (
                  <th key={role.id} className="text-center font-medium px-4 py-3 whitespace-nowrap">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {permissions.map((permission) => (
                <tr key={permission.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap sticky left-0 bg-background">
                    <span className="font-mono text-xs text-text-primary">{permission.key}</span>
                  </td>
                  {roles.map((role) => {
                    const granted = role.permissions.some((p) => p.id === permission.id);
                    return (
                      <td key={role.id} className="px-4 py-2.5 text-center">
                        {granted && <Check size={14} className="inline text-primary" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
