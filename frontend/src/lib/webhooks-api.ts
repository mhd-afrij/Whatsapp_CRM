import { apiClient, unwrap } from "@/lib/api-client";

export interface WebhookEndpoint {
  id: number;
  name: string;
  url: string;
  description: string | null;
  is_active: boolean;
  timeout_seconds: number;
  max_retries: number;
  has_secret: boolean;
  last_delivery_at: string | null;
  created_by: number;
  created_at: string | null;
  events: string[];
}

export interface WebhookEndpointFormValues {
  name: string;
  url: string;
  description?: string | null;
  is_active?: boolean;
  timeout_seconds?: number;
  max_retries?: number;
  events?: string[];
}

export interface WebhookTestResult {
  eventId: string;
  event: string;
  status: number | null;
  body: string | null;
  error: string | null;
  durationMs: number;
  signature: string;
}

export const WEBHOOK_EVENT_CATALOG: { event: string; group: string; label: string }[] = [
  { event: "whatsapp.account.connected", group: "WhatsApp", label: "Account connected" },
  { event: "whatsapp.account.disconnected", group: "WhatsApp", label: "Account disconnected" },
  { event: "whatsapp.account.qr_required", group: "WhatsApp", label: "QR code required" },
  { event: "whatsapp.account.reconnecting", group: "WhatsApp", label: "Account reconnecting" },
  { event: "whatsapp.account.logged_out", group: "WhatsApp", label: "Account logged out" },
  { event: "whatsapp.account.error", group: "WhatsApp", label: "Account connection error" },
  { event: "whatsapp.message.sent", group: "Messages", label: "Message sent" },
  { event: "whatsapp.message.failed", group: "Messages", label: "Message send failed" },
  { event: "conversation.created", group: "Conversations", label: "Conversation created" },
  { event: "conversation.assigned", group: "Conversations", label: "Conversation assigned" },
  { event: "conversation.closed", group: "Conversations", label: "Conversation closed" },
  { event: "contact.created", group: "Contacts", label: "Contact created" },
  { event: "lead.created", group: "Leads", label: "Lead created" },
  { event: "lead.updated", group: "Leads", label: "Lead updated" },
  { event: "lead.converted", group: "Leads", label: "Lead converted" },
];

export async function fetchWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  const data = await unwrap<unknown>(apiClient.get("/webhooks"));
  if (Array.isArray(data)) return data as WebhookEndpoint[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: WebhookEndpoint[] }).data;
  }
  return [];
}

export async function fetchWebhookEndpoint(id: number): Promise<WebhookEndpoint> {
  return unwrap(apiClient.get(`/webhooks/${id}`));
}

export async function createWebhookEndpoint(values: WebhookEndpointFormValues): Promise<WebhookEndpoint> {
  return unwrap(apiClient.post("/webhooks", values));
}

export async function updateWebhookEndpoint(
  id: number,
  values: Partial<WebhookEndpointFormValues>
): Promise<WebhookEndpoint> {
  return unwrap(apiClient.patch(`/webhooks/${id}`, values));
}

export async function deleteWebhookEndpoint(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/webhooks/${id}`));
}

export async function rotateWebhookSecret(id: number): Promise<{ id: number; regeneratedAt: string }> {
  return unwrap(apiClient.post(`/webhooks/${id}/rotate-secret`));
}

export async function testWebhookEndpoint(
  id: number,
  event: string
): Promise<WebhookTestResult> {
  return unwrap(apiClient.post(`/webhooks/${id}/test`, { event }));
}
