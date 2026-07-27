import { authFetch } from "../store/index.js";

export const roleService = {
  list: () => authFetch("/roles"),

  get: (id) => authFetch(`/roles/${id}`),

  permissions: () => authFetch("/permissions"),

  create: (data) =>
    authFetch("/roles", { method: "POST", body: data }),

  update: (id, data) =>
    authFetch(`/roles/${id}`, { method: "PUT", body: data }),

  delete: (id) =>
    authFetch(`/roles/${id}`, { method: "DELETE" }),

  syncPermissions: (id, permissionIds) =>
    authFetch(`/roles/${id}/permissions`, {
      method: "PUT",
      body: { permission_ids: permissionIds },
    }),
};
