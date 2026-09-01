import { authFetch } from "../store/index.js";

export const settingsService = {
  list: () => authFetch("/settings"),

  get: (key) => authFetch(`/settings/${key}`),

  update: (settings) =>
    authFetch("/settings", { method: "PUT", body: { settings } }),
};
