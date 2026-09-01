import { apiRequest } from "./apiClient.js";

export async function getContacts(accessToken) {
  return apiRequest("/crm/contacts", { accessToken });
}

export async function createContact(accessToken, data) {
  return apiRequest("/crm/contacts", {
    method: "POST",
    accessToken,
    body: data,
  });
}

export async function updateContact(accessToken, contactId, data) {
  return apiRequest(`/crm/contacts/${contactId}`, {
    method: "PATCH",
    accessToken,
    body: data,
  });
}

export async function archiveContact(accessToken, contactId) {
  return apiRequest(`/crm/contacts/${contactId}/archive`, {
    method: "POST",
    accessToken,
  });
}

export async function deleteContact(accessToken, contactId) {
  return apiRequest(`/crm/contacts/${contactId}`, {
    method: "DELETE",
    accessToken,
  });
}
