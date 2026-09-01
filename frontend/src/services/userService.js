import { authFetch, useAuthStore } from "../store/index.js";

export const userService = {
  list: (search, status) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const qs = params.toString();
    return authFetch(`/users${qs ? `?${qs}` : ""}`);
  },

  get: (id) => authFetch(`/users/${id}`),

  permissions: (id) => authFetch(`/users/${id}/permissions`),

  create: (data) =>
    authFetch("/users", { method: "POST", body: data }),

  update: (id, data) =>
    authFetch(`/users/${id}`, { method: "PUT", body: data }),

  syncPermissions: (id, overrides) =>
    authFetch(`/users/${id}/permissions`, { method: "PUT", body: { overrides } }),

  updateStatus: (id, status) =>
    authFetch(`/users/${id}/status`, { method: "PATCH", body: { status } }),

  delete: (id) =>
    authFetch(`/users/${id}`, { method: "DELETE" }),

  resetPassword: (id) =>
    authFetch(`/users/${id}/reset-password`, { method: "POST" }),

  resendInvite: (id) =>
    authFetch(`/users/${id}/resend-invite`, { method: "POST" }),

  uploadAvatar: async (id, file) => {
    const state = useAuthStore.getState();
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1"}/users/${id}/avatar`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${state.accessToken}` },
        body: formData,
      }
    );
    const payload = await response.json();
    if (!response.ok) throw { status: response.status, ...payload };
    return payload.data;
  },
};
