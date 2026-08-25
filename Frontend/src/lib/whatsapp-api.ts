import { apiClient, unwrap } from "@/lib/api-client";

export type WhatsappConnectionStatus =
  | "idle"
  | "connecting"
  | "qr_pending"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "auth_required"
  | "error";

export interface WhatsappStatus {
  workspaceId?: number;
  status: WhatsappConnectionStatus;
  qrCode: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
}

export interface WhatsappConnectionEvent {
  id: number;
  event_type: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface WhatsappHealth {
  status: string;
  whatsapp: {
    status: WhatsappConnectionStatus;
    phoneNumber: string | null;
    qrPending: boolean;
  };
  infrastructure: {
    redis: "ok" | "error";
    mysql: "ok" | "error";
  };
}

export async function fetchWhatsappStatus(): Promise<WhatsappStatus> {
  return unwrap(apiClient.get("/whatsapp/status"));
}

export async function fetchWhatsappHealth(): Promise<WhatsappHealth> {
  return unwrap(apiClient.get("/whatsapp/health"));
}

export async function fetchWhatsappQr(): Promise<Partial<WhatsappStatus>> {
  return unwrap(apiClient.get("/whatsapp/qr"));
}

export async function connectWhatsapp(): Promise<WhatsappStatus> {
  return unwrap(apiClient.post("/whatsapp/connect"));
}

export async function disconnectWhatsapp(): Promise<WhatsappStatus> {
  return unwrap(apiClient.post("/whatsapp/disconnect"));
}

export async function logoutWhatsapp(): Promise<WhatsappStatus> {
  return unwrap(apiClient.post("/whatsapp/logout"));
}

export async function reconnectWhatsapp(): Promise<WhatsappStatus> {
  return unwrap(apiClient.post("/whatsapp/reconnect"));
}

export async function fetchWhatsappConnectionHistory(): Promise<WhatsappConnectionEvent[]> {
  return unwrap(apiClient.get("/whatsapp/connection-history"));
}
