import { ApiError } from "@/lib/api-error";

const SYNC_BASE_URL =
  import.meta.env.VITE_SYNC_BASE_URL ?? "http://localhost:3100";

export interface SyncRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function syncRequest<T>(
  path: string,
  { body, headers, ...init }: SyncRequestOptions = {}
): Promise<T> {
  const response = await fetch(`${SYNC_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
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
