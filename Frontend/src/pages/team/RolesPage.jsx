import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Check,
  Search,
  Users,
  KeyRound,
  Layers3,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  MessageCircle,
  Target,
  StickyNote,
  Tag,
  CheckSquare,
  BarChart3,
  FileText,
  UserCog,
  Users2,
  ScrollText,
  Settings,
  Building2,
} from "lucide-react";
import { roleService } from "../../services/roleService.js";
import { userService } from "../../services/userService.js";
import { Button } from "../../components/common/Button.jsx";
import { EmptyState } from "../../components/common/EmptyState.jsx";
import { Modal } from "../../components/common/Modal.jsx";
import { ConfirmDialog } from "../../components/common/ConfirmDialog.jsx";
import { Tabs } from "../../components/common/Tabs.jsx";

const ROLE_COLORS = [
  { avatar: "bg-primary/20 text-primary", badge: "bg-primary/15 text-primary", ring: "border-primary bg-primary/10" },
  { avatar: "bg-blue-500/20 text-blue-400", badge: "bg-blue-500/15 text-blue-400", ring: "border-blue-500 bg-blue-500/10" },
  { avatar: "bg-purple-500/20 text-purple-400", badge: "bg-purple-500/15 text-purple-400", ring: "border-purple-500 bg-purple-500/10" },
  { avatar: "bg-orange-500/20 text-orange-400", badge: "bg-orange-500/15 text-orange-400", ring: "border-orange-500 bg-orange-500/10" },
  { avatar: "bg-teal-500/20 text-teal-400", badge: "bg-teal-500/15 text-teal-400", ring: "border-teal-500 bg-teal-500/10" },
  { avatar: "bg-pink-500/20 text-pink-400", badge: "bg-pink-500/15 text-pink-400", ring: "border-pink-500 bg-pink-500/10" },
];

const MODULE_META = {
  workspace: { label: "Workspace", icon: Building2 },
  conversations: { label: "Conversations", icon: MessageSquare },
  messages: { label: "Messages", icon: MessageCircle },
  customers: { label: "Customers", icon: Users },
  leads: { label: "Leads", icon: Target },
  notes: { label: "Notes", icon: StickyNote },
  tags: { label: "Tags", icon: Tag },
  tasks: { label: "Tasks", icon: CheckSquare },
  analytics: { label: "Analytics", icon: BarChart3 },
  reports: { label: "Reports", icon: FileText },
  users: { label: "Users", icon: UserCog },
  roles: { label: "Roles", icon: ShieldCheck },
  teams: { label: "Teams", icon: Users2 },
  audit: { label: "Audit", icon: ScrollText },
  settings: { label: "Settings", icon: Settings },
};

const PAGE_SIZE = 6;

function initials(name) {
  return (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function actionLabel(action) {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function groupPermissionsByModule(permissions) {
  const groups = {};
  for (const perm of permissions) {
    const parts = perm.key.split(".");
    const moduleKey = parts[0];
    const action = parts.length > 2 ? parts.slice(1, -1).join("_") : parts[1];
    (groups[moduleKey] ??= { key: moduleKey, actions: [] }).actions.push({
      id: perm.id,
      key: perm.key,
      label: actionLabel(action),
      description: perm.description,
    });
  }
  return groups;
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [dirtyPermissions, setDirtyPermissions] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [roleSearch, setRoleSearch] = useState("");
  const [sortByUsers, setSortByUsers] = useState(false);
  const [page, setPage] = useState(1);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [collapsedModules, setCollapsedModules] = useState({});
  const [activeRoleTab, setActiveRoleTab] = useState("permissions");

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => roleService.list(),
  });

  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => roleService.permissions(),
  });

  const usersQuery = useQuery({
    queryKey: ["team-members-all"],
    queryFn: () => userService.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => roleService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => roleService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => roleService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setConfirmDelete(null);
      if (selectedRoleId === confirmDelete?.id) {
        setSelectedRoleId(null);
        setDirtyPermissions(null);
      }
    },
  });

  const syncPermissionsMutation = useMutation({
    mutationFn: ({ id, permissionIds }) => roleService.syncPermissions(id, permissionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setDirtyPermissions(null);
    },
  });

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (role) => {
    setEditingRole(role);
    setForm({ name: role.name, description: role.description ?? "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRole(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingRole) {
      updateMutation.mutate({ id: editingRole.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const selectRole = (role) => {
    setSelectedRoleId(role.id);
    setDirtyPermissions(null);
    setPermissionSearch("");
    setModuleFilter("");
    setActiveRoleTab("permissions");
  };

  const roles = rolesQuery.data ?? [];
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  const togglePermission = (permId) => {
    if (!selectedRole) return;
    const current = dirtyPermissions ?? selectedRole.permissions?.map((p) => p.id) ?? [];
    const next = current.includes(permId) ? current.filter((id) => id !== permId) : [...current, permId];
    setDirtyPermissions(next);
  };

  const savePermissions = () => {
    if (!selectedRole || !dirtyPermissions) return;
    syncPermissionsMutation.mutate({ id: selectedRole.id, permissionIds: dirtyPermissions });
  };

  const currentPermissionIds = dirtyPermissions ?? selectedRole?.permissions?.map((p) => p.id) ?? [];
  const permissions = permissionsQuery.data ?? [];
  const groupedPermissions = useMemo(() => groupPermissionsByModule(permissions), [permissions]);

  const filteredGroupedPermissions = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    return Object.fromEntries(
      Object.entries(groupedPermissions)
        .filter(([moduleKey]) => !moduleFilter || moduleKey === moduleFilter)
        .map(([moduleKey, group]) => {
          if (!query) return [moduleKey, group];
          const moduleLabel = (MODULE_META[moduleKey]?.label ?? moduleKey).toLowerCase();
          if (moduleLabel.includes(query)) return [moduleKey, group];
          return [
            moduleKey,
            { ...group, actions: group.actions.filter((a) => `${a.label} ${a.description ?? ""}`.toLowerCase().includes(query)) },
          ];
        })
        .filter(([, group]) => group.actions.length > 0)
    );
  }, [groupedPermissions, permissionSearch, moduleFilter]);

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    let list = query
      ? roles.filter((role) => `${role.name} ${role.description ?? ""}`.toLowerCase().includes(query))
      : roles;
    if (sortByUsers) list = [...list].sort((a, b) => (b.users_count ?? 0) - (a.users_count ?? 0));
    return list;
  }, [roleSearch, roles, sortByUsers]);

  const pageCount = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRoles = filteredRoles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const roleStats = useMemo(() => {
    return {
      roles: roles.length,
      systemRoles: roles.filter((role) => role.is_system_role).length,
      permissions: permissions.length,
      usersAssigned: roles.reduce((sum, r) => sum + (r.users_count ?? 0), 0),
    };
  }, [permissions.length, roles]);

  const roleUsers = useMemo(() => {
    if (!selectedRole || !usersQuery.data) return [];
    return usersQuery.data.filter((u) => u.roles?.some((r) => r.id === selectedRole.id));
  }, [selectedRole, usersQuery.data]);

  const roleIndex = selectedRole ? roles.findIndex((r) => r.id === selectedRole.id) : -1;
  const colors = ROLE_COLORS[(roleIndex < 0 ? 0 : roleIndex) % ROLE_COLORS.length];

  const permissionsTab = selectedRole && (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 rounded-[10px] border border-border bg-background px-3 py-2 flex items-center gap-2">
          <Search size={15} className="text-text-muted" />
          <input
            value={permissionSearch}
            onChange={(e) => setPermissionSearch(e.target.value)}
            placeholder="Search permissions"
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
        >
          <option value="">All Modules</option>
          {Object.keys(groupedPermissions).map((moduleKey) => (
            <option key={moduleKey} value={moduleKey}>
              {MODULE_META[moduleKey]?.label ?? moduleKey}
            </option>
          ))}
        </select>
      </div>

      {dirtyPermissions && (
        <div className="flex items-center justify-between rounded-[10px] border border-primary/40 bg-primary-soft/10 px-4 py-2.5 mb-4">
          <p className="text-xs text-text-secondary">You have unsaved permission changes.</p>
          <Button size="sm" onClick={savePermissions} disabled={syncPermissionsMutation.isPending}>
            {syncPermissionsMutation.isPending ? "Saving..." : "Save permissions"}
          </Button>
        </div>
      )}

      <div className="space-y-3 max-h-[calc(100vh-500px)] min-h-[240px] overflow-y-auto pr-1 -mr-1">
        {Object.entries(filteredGroupedPermissions).length > 0 ? (
          Object.entries(filteredGroupedPermissions).map(([moduleKey, group]) => {
            const meta = MODULE_META[moduleKey] ?? { label: moduleKey, icon: KeyRound };
            const Icon = meta.icon;
            const collapsed = !!collapsedModules[moduleKey];
            return (
              <div key={moduleKey} className="rounded-[10px] border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollapsedModules((p) => ({ ...p, [moduleKey]: !p[moduleKey] }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface-raised hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={15} className="text-primary" />
                    <span className="text-sm font-medium text-text-primary">{meta.label}</span>
                    <span className="text-xs text-text-muted">{group.actions.length} permission{group.actions.length !== 1 ? "s" : ""}</span>
                  </div>
                  <ChevronDown size={16} className={`text-text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                </button>
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-t border-border-muted">
                          <th className="text-left font-medium px-4 py-2 text-[11px] text-text-muted uppercase tracking-wide">Access</th>
                          {group.actions.map((a) => (
                            <th key={a.id} className="text-center font-medium px-4 py-2 text-[11px] text-text-muted uppercase tracking-wide whitespace-nowrap">
                              {a.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border-muted">
                          <td className="px-4 py-3 text-xs text-text-secondary">{meta.label}</td>
                          {group.actions.map((a) => {
                            const granted = currentPermissionIds.includes(a.id);
                            return (
                              <td key={a.id} className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  title={a.description}
                                  onClick={() => togglePermission(a.id)}
                                  className={`inline-flex items-center justify-center w-5 h-5 rounded border cursor-pointer ${
                                    granted ? "bg-primary border-primary text-white" : "border-border bg-surface"
                                  }`}
                                  aria-label={`${granted ? "Remove" : "Grant"} ${a.key}`}
                                >
                                  {granted && <Check size={12} />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-[10px] border border-dashed border-border p-8 text-center text-sm text-text-muted">
            No permissions match your search.
          </div>
        )}
      </div>
    </div>
  );

  const usersTab = selectedRole && (
    <div className="space-y-2 max-h-[calc(100vh-460px)] min-h-[200px] overflow-y-auto pr-1 -mr-1">
      {roleUsers.length > 0 ? (
        roleUsers.map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2.5">
            {u.avatar_path ? (
              <img src={u.avatar_path} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
                {initials(u.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
              <p className="text-xs text-text-muted truncate">{u.email}</p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${u.status === "active" ? "bg-primary/15 text-primary" : "bg-surface-raised text-text-muted"}`}>
              {u.status}
            </span>
          </div>
        ))
      ) : (
        <EmptyState icon={Users} title="No users assigned" description="No team members currently hold this role." />
      )}
    </div>
  );

  const roleInfoTab = selectedRole && (
    <div className="rounded-[10px] border border-border divide-y divide-border-muted">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-text-muted">Name</span>
        <span className="text-sm text-text-primary font-medium">{selectedRole.name}</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-text-muted">Slug</span>
        <span className="text-sm text-text-primary font-mono">{selectedRole.slug}</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-text-muted">Type</span>
        <span className="text-sm text-text-primary">{selectedRole.is_system_role ? "System role" : "Custom role"}</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-text-muted">Users assigned</span>
        <span className="text-sm text-text-primary">{selectedRole.users_count ?? 0}</span>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-text-muted">Permissions granted</span>
        <span className="text-sm text-text-primary">{selectedRole.permissions?.length ?? 0} of {permissions.length}</span>
      </div>
      {selectedRole.created_at && (
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-text-muted">Created</span>
          <span className="text-sm text-text-primary">{new Date(selectedRole.created_at).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Roles & Permissions</h1>
          <p className="text-sm text-text-muted mt-1">Manage roles and their access permissions.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} className="mr-1.5" /> Create Role
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <div className="rounded-[12px] border border-border bg-surface p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-[11px] text-text-muted uppercase tracking-wide">Total Roles</p>
            <p className="text-xl font-semibold text-text-primary leading-tight">{roleStats.roles}</p>
            <p className="text-[11px] text-text-muted">Active roles</p>
          </div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
            <Users2 size={18} />
          </div>
          <div>
            <p className="text-[11px] text-text-muted uppercase tracking-wide">System Roles</p>
            <p className="text-xl font-semibold text-text-primary leading-tight">{roleStats.systemRoles}</p>
            <p className="text-[11px] text-text-muted">Default system roles</p>
          </div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
            <KeyRound size={18} />
          </div>
          <div>
            <p className="text-[11px] text-text-muted uppercase tracking-wide">Total Permissions</p>
            <p className="text-xl font-semibold text-text-primary leading-tight">{roleStats.permissions}</p>
            <p className="text-[11px] text-text-muted">System permissions</p>
          </div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
            <UserCog size={18} />
          </div>
          <div>
            <p className="text-[11px] text-text-muted uppercase tracking-wide">Users Assigned</p>
            <p className="text-xl font-semibold text-text-primary leading-tight">{roleStats.usersAssigned}</p>
            <p className="text-[11px] text-text-muted">Across all roles</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
        <div className="rounded-[12px] border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Roles</h2>
          <p className="text-xs text-text-muted mb-3">Manage roles and their members</p>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 rounded-[10px] border border-border bg-background px-3 py-2 flex items-center gap-2">
              <Search size={15} className="text-text-muted" />
              <input
                value={roleSearch}
                onChange={(e) => {
                  setRoleSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search roles..."
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortByUsers((s) => !s)}
              title="Sort by users"
              aria-pressed={sortByUsers}
              className={`h-[38px] w-[38px] shrink-0 rounded-[10px] border flex items-center justify-center transition-colors ${
                sortByUsers ? "border-primary text-primary bg-primary/10" : "border-border text-text-muted hover:bg-surface-hover"
              }`}
            >
              <Layers3 size={15} />
            </button>
          </div>

          <div className="space-y-2">
            {pagedRoles.length > 0 ? (
              pagedRoles.map((role) => {
                const idx = roles.findIndex((r) => r.id === role.id);
                const c = ROLE_COLORS[(idx < 0 ? 0 : idx) % ROLE_COLORS.length];
                const selected = selectedRoleId === role.id;
                return (
                  <div
                    key={role.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectRole(role)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectRole(role);
                      }
                    }}
                    className={`w-full text-left rounded-[10px] border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      selected ? c.ring : "border-border bg-background hover:bg-surface-hover"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${c.avatar}`}>
                        {initials(role.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text-primary">{role.name}</span>
                          {role.is_system_role && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.badge}`}>System Role</span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 truncate">
                          {role.description || `${role.permissions?.length ?? 0} permissions`}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-text-muted shrink-0" />
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-muted">
                      <span className="text-xs text-text-muted">
                        {role.users_count ?? 0} User{(role.users_count ?? 0) !== 1 ? "s" : ""}
                      </span>
                      {!role.is_system_role && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            className="p-1 hover:bg-surface-hover rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(role);
                            }}
                            aria-label={`Edit ${role.name}`}
                          >
                            <Pencil size={12} className="text-text-muted" />
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-surface-hover rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(role);
                            }}
                            aria-label={`Delete ${role.name}`}
                          >
                            <Trash2 size={12} className="text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[10px] border border-dashed border-border bg-background p-4 text-sm text-text-muted text-center">
                No roles match your search.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-muted">
            <p className="text-xs text-text-muted">
              Showing {pagedRoles.length} of {filteredRoles.length} role{filteredRoles.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-text-muted disabled:opacity-40 hover:bg-surface-hover"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="h-7 min-w-7 px-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
                {currentPage}
              </span>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-text-muted disabled:opacity-40 hover:bg-surface-hover"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[12px] border border-border bg-surface min-h-[calc(100vh-320px)]">
          {selectedRole ? (
            <div className="p-4">
              <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-border-muted">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${colors.avatar}`}>
                    {initials(selectedRole.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-text-primary">{selectedRole.name}</h2>
                      {selectedRole.is_system_role && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>System Role</span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {selectedRole.description ||
                        (selectedRole.is_system_role
                          ? "System role name is locked, but permissions can be edited below"
                          : "Toggle checkboxes to modify permissions")}
                    </p>
                  </div>
                </div>
                {selectedRole.is_system_role ? (
                  <Button variant="secondary" size="sm" onClick={() => setActiveRoleTab("permissions")} className="shrink-0">
                    <KeyRound size={13} className="mr-1.5" />
                    Edit permissions
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => openEdit(selectedRole)} className="shrink-0">
                    <Pencil size={13} className="mr-1.5" /> Edit Role
                  </Button>
                )}
              </div>

              <Tabs
                activeTab={activeRoleTab}
                onChange={setActiveRoleTab}
                tabs={[
                  { id: "permissions", label: "Permissions", content: permissionsTab },
                  { id: "users", label: `Users (${roleUsers.length})`, content: usersTab },
                  { id: "info", label: "Role Info", content: roleInfoTab },
                ]}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-[calc(100vh-320px)]">
              <EmptyState icon={ShieldCheck} title="Select a role" description="Choose a role from the list to view and edit its permissions." />
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingRole ? "Edit Role" : "Create Role"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary block mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingRole ? "Save changes" : "Create role"}
            </Button>
          </div>
          {createMutation.isError && <p className="text-xs text-red-600">{createMutation.error?.message || "Failed to create role"}</p>}
          {updateMutation.isError && <p className="text-xs text-red-600">{updateMutation.error?.message || "Failed to update role"}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        title="Delete Role"
        message={`Are you sure you want to delete "${confirmDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
