"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import {
  useCreateRole,
  useDeleteRole,
  usePermissionCatalog,
  useRoles,
  useUpdateRole,
} from "@/hooks/use-admin";
import { ApiError } from "@/lib/api-client";
import type { Role } from "@/lib/admin-api";
import { ErrorState } from "@/components/ui/error-state";

function RoleColumn({
  role,
  allPermissionNames,
  canManage,
}: {
  role: Role;
  allPermissionNames: string[];
  canManage: boolean;
}) {
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();
  const [pending, setPending] = useState<Set<string>>(new Set(role.permissions));
  const [error, setError] = useState<string | null>(null);

  const editable = canManage && !role.is_system;

  const togglePermission = async (name: string) => {
    if (!editable) return;
    const next = new Set(pending);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setPending(next);
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: role.id, values: { permissions: Array.from(next) } });
    } catch (err) {
      setPending(new Set(role.permissions));
      setError(err instanceof ApiError ? err.message : "Unable to update permission.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete role "${role.name}"? This is only possible if no users hold it.`)) return;
    try {
      await deleteMutation.mutateAsync(role.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete role.");
    }
  };

  return (
    <div className="min-w-[180px] flex-1">
      <div className="mb-2 flex items-center justify-between gap-1">
        <div>
          <p className="text-sm font-semibold text-text">{role.name}</p>
          <p className="text-xs text-muted">
            {role.is_system ? "System role" : `Custom · ${role.users_count} user(s)`}
          </p>
        </div>
        {!role.is_system && canManage && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${role.name}`}
            className="rounded-md p-1 text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <ul className="space-y-1">
        {allPermissionNames.map((name) => (
          <li key={name} className="flex h-7 items-center justify-center border-b border-border/50">
            <input
              type="checkbox"
              checked={pending.has(name)}
              onChange={() => togglePermission(name)}
              disabled={!editable}
              title={
                role.is_system
                  ? "System roles are protected — their permissions match docs/07-permission-matrix.md and cannot be changed here."
                  : undefined
              }
              className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateRoleForm() {
  const createMutation = useCreateRole();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ name: name.trim() });
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create role.");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">New custom role</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name"
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={createMutation.isPending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function RolesManager() {
  const { data: roles, isLoading: rolesLoading, isError: rolesError, refetch: refetchRoles } = useRoles();
  const { data: catalog, isLoading: catalogLoading, isError: catalogError, refetch: refetchCatalog } = usePermissionCatalog();
  const canManage = usePermission("roles.manage");

  const isLoading = rolesLoading || catalogLoading;
  const isError = rolesError || catalogError;

  const groups = catalog ? Object.entries(catalog) : [];
  const allPermissionNames = groups.flatMap(([, perms]) => perms.map((p) => p.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Roles &amp; Permissions</h1>
        <p className="mt-1 text-sm text-muted">
          The 5 system roles (Super Administrator, Administrator, Manager, Agent, Viewer) are
          seeded per <code className="rounded bg-primary-soft px-1 py-0.5 text-xs">docs/07-permission-matrix.md</code>{" "}
          and protected — their checkboxes are shown for reference but disabled. Custom roles are
          fully editable. Gated behind <code className="rounded bg-primary-soft px-1 py-0.5 text-xs">roles.manage</code>.
        </p>
      </div>

      {canManage && <CreateRoleForm />}

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <ErrorState
          message="Unable to load roles or permissions."
          onRetry={() => {
            refetchRoles();
            refetchCatalog();
          }}
        />
      )}

      {!isLoading && !isError && roles && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-4">
            <div className="w-56 shrink-0 pt-[52px]">
              {groups.map(([group, perms]) => (
                <div key={group}>
                  <p className="mt-1 h-6 text-xs font-semibold uppercase text-muted">{group}</p>
                  {perms.map((p) => (
                    <p key={p.name} className="flex h-7 items-center truncate text-sm text-text" title={p.description ?? p.name}>
                      {p.name}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-1 gap-4">
              {roles.map((role) => (
                <RoleColumn key={role.id} role={role} allPermissionNames={allPermissionNames} canManage={canManage} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RolesSettingsPage() {
  return (
    <RequirePermission permission="roles.view">
      <RolesManager />
    </RequirePermission>
  );
}
