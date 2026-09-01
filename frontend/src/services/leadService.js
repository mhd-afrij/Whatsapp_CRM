import { apiRequest } from "./apiClient.js";

export async function getLeads(accessToken) {
  return apiRequest("/crm/leads", { accessToken });
}

export async function createLead(accessToken, data) {
  return apiRequest("/crm/leads", {
    method: "POST",
    accessToken,
    body: data,
  });
}

export async function updateLead(accessToken, leadId, data) {
  return apiRequest(`/crm/leads/${leadId}`, {
    method: "PATCH",
    accessToken,
    body: data,
  });
}

export async function archiveLead(accessToken, leadId) {
  return apiRequest(`/crm/leads/${leadId}/archive`, {
    method: "POST",
    accessToken,
  });
}

export async function deleteLead(accessToken, leadId) {
  return apiRequest(`/crm/leads/${leadId}`, {
    method: "DELETE",
    accessToken,
  });
}
