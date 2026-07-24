import { ApiError } from "@/lib/api-error";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string | null;
}

/**
 * Low-level fetch wrapper: JSON in, JSON out, throws ApiError on non-2xx.
 * No auth-refresh logic here — see useAuthStore for the authenticated
 * wrapper that retries once after a silent token refresh on 401.
 */
export async function apiRequest<T>(
  path: string,
  { body, accessToken, headers, ...init }: ApiRequestOptions = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload ?? { message: response.statusText });
  }

  return (payload?.data ?? payload) as T;
}
