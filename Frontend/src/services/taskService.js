import { apiRequest } from "./apiClient.js";

export async function getTasks(accessToken) {
  return apiRequest("/crm/tasks", { accessToken });
}

export async function createTask(accessToken, data) {
  return apiRequest("/crm/tasks", {
    method: "POST",
    accessToken,
    body: data,
  });
}

export async function updateTask(accessToken, taskId, data) {
  return apiRequest(`/crm/tasks/${taskId}`, {
    method: "PATCH",
    accessToken,
    body: data,
  });
}

export async function archiveTask(accessToken, taskId) {
  return apiRequest(`/crm/tasks/${taskId}/archive`, {
    method: "POST",
    accessToken,
  });
}

export async function deleteTask(accessToken, taskId) {
  return apiRequest(`/crm/tasks/${taskId}`, {
    method: "DELETE",
    accessToken,
  });
}

export async function getCalendarEvents(accessToken) {
  return apiRequest("/crm/calendar", { accessToken });
}

export async function createCalendarEvent(accessToken, data) {
  return apiRequest("/crm/calendar", {
    method: "POST",
    accessToken,
    body: data,
  });
}
