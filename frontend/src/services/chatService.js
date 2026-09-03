import { apiRequest } from "./apiClient.js";

const SYNC_BASE_URL =
  import.meta.env.VITE_SYNC_BASE_URL ?? "http://localhost:3100";

/**
 * @param {string} path
 * @param {{ body?: unknown, method?: string, headers?: HeadersInit }} options
 * @returns {Promise<*>}
 */
export async function syncRequest(
  path,
  { body, headers, ...init } = {}
) {
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
    const error = new Error(payload?.message ?? response.statusText);
    error.status = response.status;
    throw error;
  }

  return (payload?.data ?? payload);
}

export async function getConversations(accessToken) {
  return apiRequest("/conversations", { accessToken });
}

export async function getConversationMessages(accessToken, conversationId) {
  return apiRequest(`/conversations/${conversationId}/messages`, { accessToken });
}

export async function sendMessage(accessToken, conversationId, body) {
  return apiRequest(`/conversations/${conversationId}/messages`, {
    method: "POST",
    accessToken,
    body: { body },
  });
}

export async function assignConversation(accessToken, conversationId, assigneeId) {
  return apiRequest(`/conversations/${conversationId}/assign`, {
    method: "PATCH",
    accessToken,
    body: { assignee_id: assigneeId },
  });
}

export async function closeConversation(accessToken, conversationId) {
  return apiRequest(`/conversations/${conversationId}/close`, {
    method: "POST",
    accessToken,
  });
}

export async function updateConversationTags(accessToken, conversationId, tags) {
  return apiRequest(`/conversations/${conversationId}/tags`, {
    method: "PATCH",
    accessToken,
    body: { tags },
  });
}
