import { apiClient, unwrap } from "@/lib/api-client";

/**
 * Frontend API layer for managed WhatsApp accounts
 * (backend: WhatsappAccountController, routes /whatsapp/accounts/*).
 *
 * The backend resolves the workspace from the authenticated user - this
 * layer never sends a workspace_id.
 */

export type WhatsappAccountStatus = "connected" | "connecting" | "disconnected" | "error";

export type WhatsappAccountRoutingMode = "default" | "round_robin" | "team_only";

export interface WhatsappAccount {
  id: number;
  name: string;
  phone_number: string | null;
  status: WhatsappAccountStatus;
  is_active: boolean;
  auto_reply_enabled: boolean;
  assigned_team_id: number | null;
  assigned_team: { id: number; name: string } | null;
  routing_mode: WhatsappAccountRoutingMode;
  session_status: string | null;
  device_name: string | null;
  last_connected_at: string | null;
  last_activity_at: string | null;
  created_by: number | null;
  created_at: string | null;
}

export interface WhatsappAccountSnapshot {
  status: string | null;
  qrCode: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
}

export interface CreateWhatsappAccountValues {
  name?: string;
  /** The real mobile number to link, normalized to bare E.164 digits. */
  mobileNumber?: string;
  assignedTeamId?: number | null;
  autoReplyEnabled?: boolean;
  routingMode?: WhatsappAccountRoutingMode;
  /** snake_case aliases accepted by the backend validation as well */
  assigned_team_id?: number | null;
  auto_reply_enabled?: boolean;
  routing_mode?: WhatsappAccountRoutingMode;
}

export interface UpdateWhatsappAccountValues {
  name?: string;
  assigned_team_id?: number | null;
  auto_reply_enabled?: boolean;
  routing_mode?: WhatsappAccountRoutingMode;
}

export async function fetchWhatsappAccounts(): Promise<WhatsappAccount[]> {
  return unwrap(apiClient.get("/whatsapp/accounts"));
}

export async function fetchWhatsappAccount(id: number): Promise<WhatsappAccount> {
  return unwrap(apiClient.get(`/whatsapp/accounts/${id}`));
}

export async function createWhatsappAccount(values: CreateWhatsappAccountValues): Promise<WhatsappAccount> {
  return unwrap(apiClient.post("/whatsapp/accounts", values));
}

export async function updateWhatsappAccount(
  id: number,
  values: UpdateWhatsappAccountValues
): Promise<WhatsappAccount> {
  return unwrap(apiClient.patch(`/whatsapp/accounts/${id}`, values));
}

export async function deleteWhatsappAccount(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/whatsapp/accounts/${id}`));
}

export async function connectWhatsappAccount(id: number): Promise<WhatsappAccountSnapshot> {
  return unwrap(apiClient.post(`/whatsapp/accounts/${id}/connect`));
}

/** Live connection snapshot for the connect wizard (poll while linking). */
export async function fetchWhatsappAccountConnectionStatus(id: number): Promise<WhatsappAccountConnectionStatus> {
  return unwrap(apiClient.get(`/whatsapp/accounts/${id}/connection-status`));
}

export async function reconnectWhatsappAccount(id: number): Promise<WhatsappAccountSnapshot> {
  return unwrap(apiClient.post(`/whatsapp/accounts/${id}/reconnect`));
}

export async function disconnectWhatsappAccount(id: number): Promise<WhatsappAccountSnapshot> {
  return unwrap(apiClient.post(`/whatsapp/accounts/${id}/disconnect`));
}

export async function fetchWhatsappAccountQr(id: number): Promise<WhatsappAccountSnapshot> {
  return unwrap(apiClient.post(`/whatsapp/accounts/${id}/qr`));
}

export interface WhatsappAccountConnectionStatus extends WhatsappAccountSnapshot {
  /** True when the gateway confirms a fully connected session. */
  connected: boolean;
  account: WhatsappAccount | null;
}

export async function setActiveWhatsappAccount(id: number): Promise<WhatsappAccount> {
  return unwrap(apiClient.post(`/whatsapp/accounts/${id}/set-active`));
}

export async function setActiveForceWhatsappAccount(id: number): Promise<WhatsappAccount> {
  return unwrap(apiClient.post(`/whatsapp/accounts/${id}/set-active-force`));
}
