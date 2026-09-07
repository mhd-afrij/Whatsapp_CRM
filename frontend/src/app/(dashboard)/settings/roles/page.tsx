"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ShieldCheck,
  Users,
  Pencil,
  Hash,
  X,
  UserCog,
  Lock,
  Save,
} from "lucide-react";
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
import type { Role, PermissionEntry } from "@/lib/admin-api";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

// ── Add Role modal ──────────────────────────────────────────────

function AddRoleModal({
  open,
  onClose,
  catalog,
}: {
  open: boolean;
  onClose: () => void;
  catalog: [string, PermissionEntry[]][];
}) {
  const createMutation = useCreateRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setSelected(new Set());
    setError(null);
  };

  const onCreate = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: Array.from(selected),
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create role.");
    }
  };

  return (
    <div className={!open ? "hidden" : ""}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => { reset(); onClose(); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-text">Add Role</h2>
              <button type="button" onClick={() => { reset(); onClose(); }} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-muted">Role name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Support Manager"
                    className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-muted">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Briefly describe this role's responsibilities…"
                    className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Permissions</p>
                <div className="space-y-3">
                  {catalog.map(([group, perms]) => (
                    <div key={group} className="rounded-xl border border-border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium capitalize text-text">{group}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const names = perms.map((p) => p.name);
                            const allSelected = names.every((n) => selected.has(n));
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (allSelected) names.forEach((n) => next.delete(n));
                              else names.forEach((n) => next.add(n));
                              return next;
                            });
                          }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {perms.every((p) => selected.has(p.name)) ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {perms.map((p) => (
                          <label
                            key={p.name}
                            title={p.description ?? p.name}
                            className={cn(
                              "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                              selected.has(p.name)
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-border bg-surface text-muted hover:bg-bg"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(p.name)}
                              onChange={() => {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p.name)) next.delete(p.name);
                                  else next.add(p.name);
                                  return next;
                                });
                              }}
                              className="h-3.5 w-3.5 accent-primary"
                            />
                            {p.name.split(".").pop()}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-xs text-muted">
                  {selected.size} permission{selected.size === 1 ? "" : "s"} selected.
                </p>
              </div>

              {error && <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { reset(); onClose(); }}
                  className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={createMutation.isPending || !name.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-muted px-4 py-2.5 text-sm font-semibold text-accent-text shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending ? "Creating…" : "Create Role"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Role card ───────────────────────────────────────────────────

function RoleCard({
  role,
  selected,
  canManage,
  onSelect,
  onDelete,
}: {
  role: Role;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-2xl border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-accent ring-2 ring-accent/30" : "border-border"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        {role.is_system ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-muted">
            <Lock className="h-3 w-3" /> System
          </span>
        ) : (
          !role.is_system && canManage && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label={`Delete ${role.name}`}
              className="rounded-md p-1.5 text-danger opacity-0 transition-opacity hover:bg-danger/10 group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold text-text">{role.name}</h3>
      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-muted">
        {role.description || (role.is_system ? "System-managed role." : "Custom role.")}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <Users className="h-3.5 w-3.5" /> {role.users_count} user{role.users_count === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <Hash className="h-3.5 w-3.5" /> {role.permissions.length} perms
        </span>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-bg"
      >
        <Pencil className="h-3.5 w-3.5" /> {selected ? "Viewing permissions" : "Edit permissions"}
      </button>
    </div>
  );
}

// ── Permission matrix ───────────────────────────────────────────

function PermissionMatrix({ role, canManage }: { role: Role; canManage: boolean }) {
  const { data: catalog } = usePermissionCatalog();
  const updateMutation = useUpdateRole();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set(role.permissions));
  const [error, setError] = useState<string | null>(null);

  const editable = canManage && !role.is_system;

  const togglePermission = (name: string) => {
    if (!editing) return;
    const next = new Set(pending);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setPending(next);
    setError(null);
  };

  const toggleGroup = (perms: import("@/lib/admin-api").PermissionEntry[]) => {
    if (!editing) return;
    const next = new Set(pending);
    const groupAll = perms.every((p) => next.has(p.name));
    if (groupAll) perms.forEach((p) => next.delete(p.name));
    else perms.forEach((p) => next.add(p.name));
    setPending(next);
    setError(null);
  };

  const onSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: role.id, values: { permissions: Array.from(pending) } });
      setEditing(false);
    } catch (err) {
      setPending(new Set(role.permissions));
      setError(err instanceof ApiError ? err.message : "Unable to update permissions.");
    }
  };

  const onCancel = () => {
    setPending(new Set(role.permissions));
    setError(null);
    setEditing(false);
  };

  const groups = catalog ? Object.entries(catalog) : [];

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!editable && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg/60 px-4 py-3 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" />
          {role.is_system
            ? "This is a protected system role. Its permissions match the approved matrix and cannot be changed here."
            : "You don't have permission to edit this role."}
        </div>
      )}

      {editable && !editing && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Permissions are read-only until you click "Edit permissions".</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-accent-muted px-4 py-2 text-sm font-semibold text-accent-text shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <Pencil className="h-4 w-4" /> Edit permissions
          </button>
        </div>
      )}

      {groups.map(([group, perms]) => {
        const groupAll = perms.every((p) => pending.has(p.name));
        return (
          <div key={group} className={cn("overflow-hidden rounded-xl border", editing ? "border-accent/50" : "border-border")}>
            <div className="flex items-center justify-between border-b border-border bg-bg/40 px-4 py-2.5">
              <p className="text-sm font-semibold capitalize text-text">{group}</p>
              {editable && editing && perms.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleGroup(perms)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {groupAll ? "Clear all" : "Select all"}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 bg-surface p-3">
              {perms.length === 0 && <p className="text-xs text-muted">No permissions in this group.</p>}
              {perms.map((p) => (
                <label
                  key={p.name}
                  title={p.description ?? p.name}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                    pending.has(p.name)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted hover:bg-bg",
                    !editing && "cursor-not-allowed opacity-80"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={pending.has(p.name)}
                    onChange={() => togglePermission(p.name)}
                    disabled={!editing}
                    className="h-3.5 w-3.5 accent-primary disabled:cursor-not-allowed"
                  />
                  {p.name.split(".").pop()}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {editable && editing && (
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-sm transition-colors hover:bg-bg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-muted px-5 py-2.5 text-sm font-semibold text-accent-text shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main manager ────────────────────────────────────────────────

function RolesManager() {
  const { data: roles, isLoading: rolesLoading, isError: rolesError, refetch: refetchRoles } = useRoles();
  const { data: catalog, isLoading: catalogLoading, isError: catalogError, refetch: refetchCatalog } = usePermissionCatalog();
  const canManage = usePermission("roles.manage");
  const deleteMutation = useDeleteRole();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const isLoading = rolesLoading || catalogLoading;
  const isError = rolesError || catalogError;

  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? null;

  const onDelete = async (role: Role) => {
    if (!window.confirm(`Delete role "${role.name}"? This is only possible if no users hold it.`)) return;
    try {
      await deleteMutation.mutateAsync(role.id);
      if (selectedRoleId === role.id) setSelectedRoleId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to delete role.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Roles &amp; Permissions</h1>
          <p className="mt-1 text-sm text-muted">Control user access and manage security policies.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-r from-accent to-accent-muted px-4 py-2.5 text-sm font-semibold text-accent-text shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg sm:self-auto"
          >
            <Plus className="h-4 w-4" /> Add Role
          </button>
        )}
      </div>

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
        <>
          {/* Role cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                selected={selectedRoleId === role.id}
                canManage={canManage}
                onSelect={() => setSelectedRoleId(role.id)}
                onDelete={() => onDelete(role)}
              />
            ))}
          </div>

          {/* Permission builder */}
          {selectedRole ? (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <UserCog className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text">Permissions for {selectedRole.name}</h2>
                  <p className="text-xs text-muted">
                    Toggle permissions to control what users with this role can do.
                  </p>
                </div>
              </div>
              <PermissionMatrix key={selectedRole.id} role={selectedRole} canManage={canManage} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-text">Select a role to configure its permissions</p>
              <p className="mt-1 text-xs text-muted">Click "Edit permissions" on any role card to manage its access.</p>
            </div>
          )}
        </>
      )}

      <AddRoleModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        catalog={catalog ? Object.entries(catalog) : []}
      />
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
