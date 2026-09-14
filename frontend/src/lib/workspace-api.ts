import { apiClient, unwrap } from "@/lib/api-client";

export interface WorkspaceStorageInfo {
  driver: string;
  bucket: string | null;
  endpoint: string | null;
}

export interface WorkspaceSecurityInfo {
  session_lifetime_minutes: number;
  session_expire_on_close: boolean;
  sanctum_token_expiration_minutes: number | null;
}

export interface WorkspaceWhatsappAccount {
  id: number | null;
  whatsapp_session_id: number | null;
  display_name: string;
  assigned_team_id: number | null;
  assigned_team: { id: number; name: string } | null;
  is_default: boolean;
  auto_reply_settings: { enabled?: boolean; message?: string | null };
  status: string | null;
  phone_number: string | null;
  device_id: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
}

export interface WorkspaceSettings {
  id: number;
  name: string;
  slug: string;
  business_category: string | null;
  country: string | null;
  whatsapp_number: string | null;
  timezone: string;
  language: string;
  logo_url: string | null;
  is_active: boolean;
  business_hours: Record<string, unknown> | null;
  default_pipeline_id: number | null;
  default_pipeline: { id: number; name: string } | null;
  notification_defaults: Record<string, unknown> | null;
  branding: Record<string, unknown> | null;
  inbox_settings: Record<string, unknown>;
  contact_settings: Record<string, unknown>;
  lead_sales_settings: Record<string, unknown>;
  integration_settings: Record<string, unknown>;
  away_message_enabled: boolean;
  away_message: string | null;
  away_message_trigger: "outside_hours" | "once_per_conversation";
  whatsapp_accounts: WorkspaceWhatsappAccount[];
  detached_whatsapp_accounts: WorkspaceWhatsappAccount[];
  storage: WorkspaceStorageInfo;
  security: WorkspaceSecurityInfo;
  billing: { configured: boolean; message: string };
}

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  return unwrap(apiClient.get("/workspace"));
}

export interface UpdateWorkspaceSettingsValues {
  name?: string;
  slug?: string;
  business_category?: string | null;
  country?: string | null;
  timezone?: string;
  language?: string;
  logo?: File;
  business_hours?: Record<string, unknown>;
  default_pipeline_id?: number | null;
  notification_defaults?: Record<string, unknown>;
  branding?: Record<string, unknown>;
  inbox_settings?: Record<string, unknown>;
  contact_settings?: Record<string, unknown>;
  lead_sales_settings?: Record<string, unknown>;
  integration_settings?: Record<string, unknown>;
  away_message_enabled?: boolean;
  away_message?: string | null;
  away_message_trigger?: "outside_hours" | "once_per_conversation";
}

export async function updateWorkspaceSettings(
  values: UpdateWorkspaceSettingsValues
): Promise<WorkspaceSettings> {
  if (values.logo) {
    const form = new FormData();
    form.append("_method", "PATCH");
    form.append("logo", values.logo);
    return unwrap(
      apiClient.post("/workspace", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    );
  }

  return unwrap(apiClient.patch("/workspace", values));
}

export interface WhatsappAccountSettingsValues {
  display_name?: string | null;
  whatsapp_session_id?: number | null;
  assigned_team_id?: number | null;
  is_default?: boolean;
  auto_reply_settings?: { enabled?: boolean; message?: string | null };
}

export async function createWorkspaceWhatsappAccount(
  values: WhatsappAccountSettingsValues
): Promise<WorkspaceWhatsappAccount> {
  return unwrap(apiClient.post("/workspace/whatsapp-accounts", values));
}

export async function updateWorkspaceWhatsappAccount(
  id: number,
  values: WhatsappAccountSettingsValues
): Promise<WorkspaceWhatsappAccount> {
  return unwrap(apiClient.patch(`/workspace/whatsapp-accounts/${id}`, values));
}

export async function deleteWorkspaceWhatsappAccount(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/workspace/whatsapp-accounts/${id}`));
}

export async function transferWorkspaceOwnership(userId: number): Promise<{ user_id: number }> {
  return unwrap(apiClient.post("/workspace/transfer-ownership", { user_id: userId }));
}

export async function disableWorkspace(confirmation: string): Promise<{ id: number; is_active: boolean }> {
  return unwrap(apiClient.post("/workspace/disable", { confirmation }));
}
