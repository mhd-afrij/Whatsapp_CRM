import { create } from "zustand";
import { apiRequest } from "../services/apiClient.js";
import { ApiError } from "../utils/apiError.js";

const REFRESH_TOKEN_STORAGE_KEY = "wa_crm_refresh_token";

function persistRefreshToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

function readRefreshToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export const useAuthStore = create((set, get) => ({
  accessToken: null,
  user: null,
  status: "idle",

  login: async (workspace, email, password) => {
    set({ status: "loading" });
    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: { workspace, email, password },
      });
      persistRefreshToken(data.refresh_token);
      set({ accessToken: data.access_token, user: data.user, status: "authenticated" });
    } catch (error) {
      set({ status: "unauthenticated" });
      throw error;
    }
  },

  logout: async () => {
    const refreshToken = readRefreshToken();
    const accessToken = get().accessToken;
    persistRefreshToken(null);
    set({ accessToken: null, user: null, status: "unauthenticated" });

    if (accessToken) {
      await apiRequest("/auth/logout", {
        method: "POST",
        accessToken,
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      }).catch(() => {});
    }
  },

  hydrate: async () => {
    const refreshToken = readRefreshToken();
    if (!refreshToken) {
      set({ status: "unauthenticated" });
      return;
    }

    set({ status: "loading" });
    try {
      const data = await apiRequest("/auth/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken },
      });
      persistRefreshToken(data.refresh_token);
      set({ accessToken: data.access_token, user: data.user, status: "authenticated" });
    } catch {
      persistRefreshToken(null);
      set({ accessToken: null, user: null, status: "unauthenticated" });
    }
  },

  hasPermission: (key) => get().user?.permissions.includes(key) ?? false,
}));

export async function authFetch(path, options = {}) {
  const state = useAuthStore.getState();

  try {
    return await apiRequest(path, { ...options, accessToken: state.accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await state.hydrate();
      const refreshedToken = useAuthStore.getState().accessToken;
      if (refreshedToken) {
        return apiRequest(path, { ...options, accessToken: refreshedToken });
      }
    }
    throw error;
  }
}
