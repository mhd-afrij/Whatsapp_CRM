import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, MoreVertical, Pencil, Power, Trash2, KeyRound, MailPlus, ShieldCheck, Search, Check, Ban, Minus } from "lucide-react";
import { userService } from "../../services/userService.js";
import { roleService } from "../../services/roleService.js";
import { Badge } from "../../components/common/Badge.jsx";
import { Button } from "../../components/common/Button.jsx";
import { EmptyState } from "../../components/common/EmptyState.jsx";
import { Modal } from "../../components/common/Modal.jsx";
import { ConfirmDialog } from "../../components/common/ConfirmDialog.jsx";

const STATUS_TONE = { active: "success", invited: "info", suspended: "danger", archived: "neutral" };

function extractApiError(error) {
  const body = error?.body;
  if (body?.errors) {
    const firstError = Object.values(body.errors).flat()?.[0];
    if (firstError) return firstError;
  }
  return error?.message || "Failed to save user.";
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, user: null });
  const [actionMenu, setActionMenu] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", password_confirmation: "", role_ids: [] });
  const [submitError, setSubmitError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [permissionUser, setPermissionUser] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState({});

  const usersQuery = useQuery({
    queryKey: ["team-members", search, statusFilter],
    queryFn: () => userService.list(search || undefined, statusFilter || undefined),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles-for-user-modal"],
    queryFn: () => roleService.list(),
    enabled: modalOpen,
  });

  const permissionMatrixQuery = useQuery({
    queryKey: ["user-permissions", permissionUser?.id],
    queryFn: () => userService.permissions(permissionUser.id),
    enabled: !!permissionUser,
  });

  const refreshUsers = () => {
    queryClient.invalidateQueries({ queryKey: ["team-members"] });
    queryClient.invalidateQueries({ queryKey: ["roles-for-user-modal"] });
  };

  const createMutation = useMutation({
    mutationFn: (data) => userService.create(data),
    onSuccess: () => {
      refreshUsers();
      setSubmitError("");
      closeModal();
    },
    onError: (error) => setSubmitError(extractApiError(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => userService.update(id, data),
    onSuccess: () => {
      refreshUsers();
      setSubmitError("");
      closeModal();
    },
    onError: (error) => setSubmitError(extractApiError(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => userService.updateStatus(id, status),
    onSuccess: () => {
      refreshUsers();
      setConfirmDialog({ open: false, type: null, user: null });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => userService.delete(id),
    onSuccess: () => {
      refreshUsers();
      setConfirmDialog({ open: false, type: null, user: null });
    },
  });

  const resetPwMutation = useMutation({
    mutationFn: (id) => userService.resetPassword(id),
    onSuccess: (data) => {
      alert(`Temporary password: ${data.temp_password}`);
      setConfirmDialog({ open: false, type: null, user: null });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id) => userService.resendInvite(id),
    onSuccess: (data) => {
      setInviteMessage(`Invite resent. Temporary password: ${data.temp_password}`);
      refreshUsers();
      setConfirmDialog({ open: false, type: null, user: null });
    },
  });

  const syncUserPermissionsMutation = useMutation({
    mutationFn: ({ id, overrides }) => userService.syncPermissions(id, overrides),
    onSuccess: () => {
      refreshUsers();
      setPermissionUser(null);
      setPermissionDraft({});
    },
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm({ name: "", email: "", password: "", password_confirmation: "", role_ids: [] });
    setSubmitError("");
    setInviteMessage("");
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setSubmitError("");
    setInviteMessage("");
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      password_confirmation: "",
      role_ids: user.roles?.map((r) => r.id) ?? [],
    });
    setModalOpen(true);
    setActionMenu(null);
  };

  const openPermissions = (user) => {
    setActionMenu(null);
    setPermissionUser(user);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
    setSubmitError("");
    setInviteMessage("");
  };

  useEffect(() => {
    if (!permissionMatrixQuery.data) return;
    const overrides = permissionMatrixQuery.data.user.permissionOverrides ?? [];
    const draft = {};
    overrides.forEach((override) => {
      draft[override.permission.id] = override.effect;
    });
    setPermissionDraft(draft);
  }, [permissionMatrixQuery.data]);

  const toggleRole = (roleId) => {
    setForm((prev) => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter((id) => id !== roleId)
        : [...prev.role_ids, roleId],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (editingUser) {
      const data = { name: form.name, email: form.email };
      if (form.role_ids.length > 0) data.role_ids = form.role_ids;
      updateMutation.mutate({ id: editingUser.id, data });
      return;
    }

    if (form.role_ids.length === 0) {
      setSubmitError("At least one role must be selected to invite a member.");
      return;
    }

    createMutation.mutate(form);
  };

  const selectedRoleNames = (rolesQuery.data ?? [])
    .filter((role) => form.role_ids.includes(role.id))
    .map((role) => role.name);

  const selectedRoles = (rolesQuery.data ?? []).filter((role) => form.role_ids.includes(role.id));

  const getRolePermissionCount = (role) => role.permissions?.length ?? 0;

  const getUserPermissionCount = (user) => {
    const permissionKeys = new Set();
    user.roles?.forEach((role) => {
      role.permissions?.forEach((permission) => permissionKeys.add(permission.key));
    });
    return permissionKeys.size;
  };

  const getUserPermissions = (user) => {
    const permissions = new Map();
    user.roles?.forEach((role) => {
      role.permissions?.forEach((permission) => {
        permissions.set(permission.key, permission);
      });
    });
    return [...permissions.values()].sort((a, b) => a.key.localeCompare(b.key));
  };

  const permissionGroups = useMemo(() => {
    const permissions = permissionMatrixQuery.data?.permissions ?? [];
    return permissions.reduce((acc, perm) => {
      const module = perm.key.split(".")[0];
      (acc[module] ??= []).push(perm);
      return acc;
    }, {});
  }, [permissionMatrixQuery.data?.permissions]);

  const setOverride = (permissionId, effect) => {
    setPermissionDraft((prev) => ({ ...prev, [permissionId]: effect }));
  };

  const saveUserPermissions = () => {
    if (!permissionUser) return;
    const overrides = (permissionMatrixQuery.data?.permissions ?? []).map((perm) => ({
      permission_id: perm.id,
      effect: permissionDraft[perm.id] ?? "inherit",
    }));
    syncUserPermissionsMutation.mutate({ id: permissionUser.id, overrides });
  };

  const confirmAction = (type, user) => {
    setConfirmDialog({ open: true, type, user });
    setActionMenu(null);
  };

  const executeConfirm = () => {
    const { type, user } = confirmDialog;
    if (!user) return;

    if (type === "delete") deleteMutation.mutate(user.id);
    else if (type === "suspend") statusMutation.mutate({ id: user.id, status: "suspended" });
    else if (type === "activate") statusMutation.mutate({ id: user.id, status: "active" });
    else if (type === "resetPassword") resetPwMutation.mutate(user.id);
    else if (type === "resendInvite") resendInviteMutation.mutate(user.id);
  };

  const confirmTitle = {
    delete: "Delete User",
    suspend: "Suspend User",
    activate: "Activate User",
    resetPassword: "Reset Password",
    resendInvite: "Resend Invite",
  };

  const confirmMessage = {
    delete: `Are you sure you want to delete ${confirmDialog.user?.name}? This action cannot be undone.`,
    suspend: `Suspend ${confirmDialog.user?.name}? They will be logged out immediately.`,
    activate: `Reactivate ${confirmDialog.user?.name}?`,
    resetPassword: `Reset password for ${confirmDialog.user?.name}? A temporary password will be generated.`,
    resendInvite: `Resend the invite for ${confirmDialog.user?.name}? A new temporary password will be generated and their status will be set back to invited.`,
  };

  const isEditing = !!editingUser;
  const confirmType = confirmDialog.type;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Team</h1>
          <p className="text-sm text-text-muted mt-1">Manage team members and their roles.</p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus size={15} className="mr-1.5" /> Invite member
        </Button>
      </div>

      {inviteMessage && (
        <div className="mb-4 rounded-[10px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {inviteMessage}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="invited">Invited</option>
        </select>
      </div>

      {usersQuery.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
          ))}
        </div>
      )}

      {usersQuery.isError && (
        <EmptyState icon={Users} title="Couldn't load team members" description="You may not have the users.view permission." />
      )}

      {usersQuery.data && usersQuery.data.length === 0 && (
        <EmptyState icon={Users} title="No team members yet" description="Invite your first teammate to get started." />
      )}

      {usersQuery.data && usersQuery.data.length > 0 && (
        <div className="rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Member</th>
                <th className="text-left font-medium px-4 py-3">Email</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Last login</th>
                <th className="text-left font-medium px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {usersQuery.data.map((user) => (
                <tr key={user.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {user.avatar_path ? (
                        <img src={user.avatar_path} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
                          {user.name.charAt(0)}
                        </div>
                      )}
                      <p className="font-medium text-text-primary">{user.name}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {getUserPermissions(user).slice(0, 4).map((permission) => (
                        <Badge key={permission.key} label={permission.key} tone="neutral" />
                      ))}
                      {getUserPermissionCount(user) > 4 && (
                        <Badge label={`+${getUserPermissionCount(user) - 4} more`} tone="neutral" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.roles?.length > 0 ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        {user.roles.map((r) => (
                          <Badge key={r.id} label={r.name} tone="primary" />
                        ))}
                        <span className="text-xs text-text-muted">
                          {user.roles.length} role{user.roles.length !== 1 ? "s" : ""} · {getUserPermissionCount(user)} permission{getUserPermissionCount(user) !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={user.status} tone={STATUS_TONE[user.status] ?? "neutral"} />
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}</td>
                  <td className="px-4 py-3 relative">
                    <button
                      className="p-1 rounded hover:bg-surface-hover"
                      onClick={() => setActionMenu(actionMenu === user.id ? null : user.id)}
                    >
                      <MoreVertical size={16} className="text-text-muted" />
                    </button>
                    {actionMenu === user.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-10 py-1">
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                          onClick={() => openEdit(user)}
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                          onClick={() => openPermissions(user)}
                        >
                          <ShieldCheck size={14} /> Permissions
                        </button>
                        {user.status === "active" ? (
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                            onClick={() => confirmAction("suspend", user)}
                          >
                            <Power size={14} /> Suspend
                          </button>
                        ) : (
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                            onClick={() => confirmAction("activate", user)}
                          >
                            <Power size={14} /> Activate
                          </button>
                        )}
                        {user.status === "invited" && (
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                            onClick={() => confirmAction("resendInvite", user)}
                          >
                            <MailPlus size={14} /> Resend invite
                          </button>
                        )}
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                          onClick={() => confirmAction("resetPassword", user)}
                        >
                          <KeyRound size={14} /> Reset password
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-surface-hover"
                          onClick={() => confirmAction("delete", user)}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={isEditing ? "Edit User" : "Invite Member"}
        panelClassName="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-text-secondary block mb-1.5">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary block mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
          </div>
          {!isEditing && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={form.password_confirmation}
                  onChange={(e) => setForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
            </div>
          )}
          <div>
            <label className="text-sm text-text-secondary block mb-2">Roles</label>
            <div className="rounded-[10px] border border-border bg-background p-1.5 space-y-1 max-h-56 overflow-y-auto">
              {rolesQuery.data?.map((role) => {
                const checked = form.role_ids.includes(role.id);
                return (
                  <label
                    key={role.id}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 cursor-pointer transition-colors ${
                      checked ? "bg-primary-soft/15" : "hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role.id)}
                      className="rounded border-border accent-primary"
                    />
                    <span className="text-sm text-text-primary flex-1 truncate">{role.name}</span>
                    <span className="text-xs text-text-muted">{getRolePermissionCount(role)} perms</span>
                    {role.is_system_role && <Badge label="System" tone="info" />}
                  </label>
                );
              })}
              {rolesQuery.isLoading && <p className="text-xs text-text-muted px-2.5 py-2">Loading roles...</p>}
              {!rolesQuery.isLoading && rolesQuery.data?.length === 0 && (
                <p className="text-xs text-text-muted px-2.5 py-2">No roles available.</p>
              )}
            </div>
            {form.role_ids.length === 0 && (
              <p className="text-xs text-text-muted mt-1.5">No role selected - member will have no permissions.</p>
            )}
            {form.role_ids.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {selectedRoleNames.map((name) => (
                    <Badge key={name} label={name} tone="primary" />
                  ))}
                </div>
                <div className="space-y-2 rounded-[10px] border border-border bg-surface p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Selected role permissions</p>
                  {selectedRoles.map((role) => (
                    <div key={role.id} className="rounded-md border border-border-muted bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text-primary">{role.name}</span>
                        <span className="text-xs text-text-muted">{getRolePermissionCount(role)} permissions</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(role.permissions ?? []).slice(0, 5).map((permission) => (
                          <Badge key={permission.key} label={permission.key} tone="neutral" />
                        ))}
                        {(role.permissions?.length ?? 0) > 5 && (
                          <Badge label={`+${role.permissions.length - 5} more`} tone="neutral" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Create user"}
            </Button>
          </div>
          {submitError && <p className="text-xs text-red-600">{submitError}</p>}
          {createMutation.isError && <p className="text-xs text-red-600">{createMutation.error?.message || "Failed to create user"}</p>}
          {updateMutation.isError && <p className="text-xs text-red-600">{updateMutation.error?.message || "Failed to update user"}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={!!permissionUser}
        onClose={() => {
          setPermissionUser(null);
          setPermissionDraft({});
        }}
        title={permissionUser ? `Permissions - ${permissionUser.name}` : "Permissions"}
        panelClassName="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-border bg-surface px-3 py-2 flex items-center gap-2">
            <Search size={15} className="text-text-muted" />
            <input
              value={""}
              placeholder="Search permissions..."
              disabled
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted opacity-60"
            />
          </div>
          <div className="space-y-3 pr-1">
            {Object.entries(permissionGroups).map(([module, perms]) => (
              <div key={module} className="rounded-[10px] border border-border overflow-hidden">
                <div className="px-4 py-2 bg-surface-raised text-xs font-medium text-text-primary uppercase tracking-wide">
                  {module}
                </div>
                <div className="divide-y divide-border-muted">
                  {perms.map((perm) => {
                    const state = permissionDraft[perm.id] ?? "inherit";
                    return (
                      <div key={perm.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">{perm.key}</p>
                          <p className="text-xs text-text-muted">{perm.description}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setOverride(perm.id, "inherit")}
                            className={`px-2.5 py-1.5 rounded-md border text-xs inline-flex items-center gap-1 ${
                              state === "inherit" ? "border-border bg-primary-soft/15 text-primary" : "border-border bg-surface text-text-muted"
                            }`}
                          >
                            <Minus size={12} /> Inherit
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(perm.id, "grant")}
                            className={`px-2.5 py-1.5 rounded-md border text-xs inline-flex items-center gap-1 ${
                              state === "grant" ? "border-green-500 bg-green-500/15 text-green-600" : "border-border bg-surface text-text-muted"
                            }`}
                          >
                            <Check size={12} /> Grant
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(perm.id, "deny")}
                            className={`px-2.5 py-1.5 rounded-md border text-xs inline-flex items-center gap-1 ${
                              state === "deny" ? "border-red-500 bg-red-500/15 text-red-600" : "border-border bg-surface text-text-muted"
                            }`}
                          >
                            <Ban size={12} /> Deny
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPermissionUser(null)}>Cancel</Button>
            <Button type="button" onClick={saveUserPermissions} disabled={syncUserPermissionsMutation.isPending}>
              {syncUserPermissionsMutation.isPending ? "Saving..." : "Save permissions"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, type: null, user: null })}
        onConfirm={executeConfirm}
        title={confirmTitle[confirmType] ?? ""}
        message={confirmMessage[confirmType] ?? ""}
        confirmLabel={
          confirmType === "delete"
            ? "Delete"
            : confirmType === "suspend"
              ? "Suspend"
              : confirmType === "activate"
                ? "Activate"
                : confirmType === "resendInvite"
                  ? "Resend"
                  : "Reset"
        }
        destructive={confirmType === "delete" || confirmType === "suspend"}
        loading={deleteMutation.isPending || statusMutation.isPending || resetPwMutation.isPending || resendInviteMutation.isPending}
      />
    </div>
  );
}
