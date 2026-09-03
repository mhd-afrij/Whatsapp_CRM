import { apiRequest } from "./apiClient.js";

/**
 * @param {{ workspace: string, email: string, password: string }} credentials
 * @returns {Promise<{ access_token: string, refresh_token: string, user: object }>}
 */
export async function login(credentials) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: credentials,
  });
}

/**
 * @param {{ refresh_token: string }} body
 * @returns {Promise<{ access_token: string, refresh_token: string, user: object }>}
 */
export async function refreshTokens(body) {
  return apiRequest("/auth/refresh", {
    method: "POST",
    body,
  });
}

/**
 * @param {string} accessToken
 * @param {{ refresh_token?: string }} body
 * @returns {Promise<null>}
 */
export async function logout(accessToken, body) {
  return apiRequest("/auth/logout", {
    method: "POST",
    accessToken,
    body,
  });
}

/**
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
export async function getMe(accessToken) {
  return apiRequest("/auth/me", { accessToken });
}
