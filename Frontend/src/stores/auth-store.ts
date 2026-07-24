import { create } from "zustand";
import { apiRequest } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import type { AuthUser, TokenResponse } from "@/types/auth";

// The refresh token is opaque and single-use-per-rotation (server revokes on
// reuse), so localStorage is an acceptable tradeoff for this phase — an
// httpOnly cookie would be stronger but requires the API and web app on a
// shared domain/CORS setup not yet in place. Tracked in docs/DECISIONS.md.
const REFRESH_TOKEN_STORAGE_KEY = "wa_crm_refresh_token";

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  login: (workspace: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

function persistRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

function readRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  status: "idle",

  login: async (workspace, email, password) => {
    set({ status: "loading" });
    try {
      const data = await apiRequest<TokenResponse>("/auth/login", {
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
      }).catch(() => {
        // Best-effort server-side revocation — local session is already cleared.
      });
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
      const data = await apiRequest<TokenResponse>("/auth/refresh", {
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

  hasPermission: (key: string) => get().user?.permissions.includes(key) ?? false,
}));

/**
 * Authenticated request helper: attaches the current access token and, on a
 * 401, attempts exactly one silent refresh-and-retry before giving up.
 */
export async function authFetch<T>(
  path: string,
  options: Parameters<typeof apiRequest<T>>[1] = {}
): Promise<T> {
  const state = useAuthStore.getState();

  try {
    return await apiRequest<T>(path, { ...options, accessToken: state.accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await state.hydrate();
      const refreshedToken = useAuthStore.getState().accessToken;
      if (refreshedToken) {
        return apiRequest<T>(path, { ...options, accessToken: refreshedToken });
      }
    }
    throw error;
  }
}
