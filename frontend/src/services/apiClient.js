import { ApiError } from "../utils/apiError.js";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

/**
 * @param {string} path
 * @param {{ body?: unknown, accessToken?: string|null, headers?: HeadersInit, method?: string }} options
 * @returns {Promise<*>}
 */
export async function apiRequest(
  path,
  { body, accessToken, headers, ...init } = {}
) {
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

  return (payload?.data ?? payload);
}
