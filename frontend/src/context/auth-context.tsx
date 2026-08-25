"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, ApiError, type ApiFailure, type ApiSuccess, type ApiResponse } from "@/lib/api-client";
import { clearToken, getToken, markAuthPresence, setToken } from "@/lib/token-store";
import { useToast } from "@/providers/toast-provider";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  workspace_id?: string;
  is_active?: boolean;
  roles: string[];
  role_keys?: Array<"super_admin" | "admin" | "user">;
  permissions: string[];
}

interface LoginResponseData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
}

/** Tolerant view of the envelope: the backend may omit `success` on 2xx. */
type AuthEnvelope<T> = Partial<ApiSuccess<T>> & Partial<ApiFailure>;

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCurrentUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data } = await apiClient.get<ApiResponse<AuthUser>>("/auth/me");
      const payload = (data as { data?: AuthUser }).data;
      if (payload) {
        setUser(payload);
        markAuthPresence(true);
      }
    } catch {
      // Token rejected or backend unreachable — treat as logged out.
      clearToken();
      setUser(null);
      markAuthPresence(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session hydration on mount is intentionally async and sets loading/user state once resolved
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await apiClient.post<ApiResponse<LoginResponseData>>("/auth/login", {
        email,
        password,
      });

      // The Laravel API returns a bare `{data: {...}}` body on success — no
      // `success` flag — so only an explicit failure envelope is an error.
      const envelope = data as AuthEnvelope<LoginResponseData>;
      if (envelope.success === false || !envelope.data?.access_token) {
        throw new ApiError(envelope.message ?? "Unable to sign in.", {
          code: envelope.code ?? null,
          errors: envelope.errors ?? null,
        });
      }

      setToken(envelope.data.access_token);
      markAuthPresence(true);
      setUser(envelope.data.user);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("Unable to sign in. Please try again.");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Best-effort: even if the server call fails, clear local session.
    } finally {
      clearToken();
      markAuthPresence(false);
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (permission: string) => user?.permissions?.includes(permission) ?? false,
    [user]
  );

  // The axios interceptor (outside React) dispatches this event when any
  // request comes back 401, so an expired/revoked session is reflected in
  // app state immediately instead of waiting for the next /auth/me poll.
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      markAuthPresence(false);
      toast("Your session has expired. Please sign in again.", "error");
    };
    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => window.removeEventListener("auth:session-expired", handleSessionExpired);
  }, [toast]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      refresh: fetchCurrentUser,
      can,
    }),
    [user, isLoading, login, logout, fetchCurrentUser, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
