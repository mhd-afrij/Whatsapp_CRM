import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { clearToken, getToken } from "./token-store";

/**
 * Standard API envelope shared by the backend for both success and failure
 * responses.
 */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: Record<string, unknown> | null;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors?: Record<string, string[]> | string[] | null;
  code?: string | null;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Normalized error shape thrown by this client for every failed request,
 * whether the failure came from the network layer or from a well-formed
 * `{ success: false, ... }` API response.
 */
export class ApiError extends Error {
  status: number | null;
  code: string | null;
  errors: Record<string, string[]> | string[] | null;

  constructor(
    message: string,
    opts: {
      status?: number | null;
      code?: string | null;
      errors?: Record<string, string[]> | string[] | null;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.errors = opts.errors ?? null;
  }
}

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // Backend always wraps bodies in the ApiResponse envelope. If a caller
    // hits an endpoint that returns success:false with a 2xx status, treat
    // it as an error too rather than silently returning it as data.
    const body = response.data as ApiResponse<unknown> | undefined;
    if (body && typeof body === "object" && "success" in body && body.success === false) {
      return Promise.reject(
        new ApiError(body.message || "Request failed", {
          status: response.status,
          code: body.code ?? null,
          errors: body.errors ?? null,
        })
      );
    }
    return response;
  },
  (error: AxiosError<ApiFailure>) => {
    if (error.response) {
      const { status, data } = error.response;

      if (status === 401) {
        // Token is invalid/expired — drop it so subsequent renders treat
        // the user as logged out instead of retrying with a dead token.
        clearToken();
        if (typeof window !== "undefined") {
          // Let AuthProvider (a React tree we can't reach from here) know the
          // session just died, and hard-redirect to /login as a fallback in
          // case no listener is mounted (e.g. this request fired outside the
          // app shell).
          window.dispatchEvent(new CustomEvent("auth:session-expired"));
          if (window.location.pathname !== "/login") {
            const from = encodeURIComponent(window.location.pathname);
            window.location.href = `/login?from=${from}&reason=session_expired`;
          }
        }
      }

      const message = data?.message || error.message || "Request failed";
      return Promise.reject(
        new ApiError(message, {
          status,
          code: data?.code ?? null,
          errors: data?.errors ?? null,
        })
      );
    }

    if (error.request) {
      return Promise.reject(
        new ApiError("Unable to reach the server. Check your connection and try again.", {
          status: null,
          code: "NETWORK_ERROR",
        })
      );
    }

    return Promise.reject(new ApiError(error.message || "Unexpected error"));
  }
);

/**
 * Unwraps the `data` field of a successful ApiResponse. Use this in
 * react-query fetchers so callers work with plain domain types instead of
 * the envelope.
 *
 * The Laravel backend returns a bare `{data: ...}` body on success and only
 * sets `success: false` on failures, so a missing flag means success.
 */
export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data: body } = await promise;
  const envelope = body as Partial<ApiSuccess<T>> & Partial<ApiFailure>;
  if (envelope.success === false || !envelope.data) {
    throw new ApiError(envelope.message ?? "Request failed", {
      code: envelope.code ?? null,
      errors: envelope.errors ?? null,
    });
  }
  return envelope.data;
}

export default apiClient;
