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

export interface WorkspaceSettings {
  id: number;
  name: string;
  slug: string;
  whatsapp_number: string | null;
  timezone: string;
  logo_url: string | null;
  is_active: boolean;
  business_hours: Record<string, unknown> | null;
  default_pipeline_id: number | null;
  default_pipeline: { id: number; name: string } | null;
  notification_defaults: Record<string, unknown> | null;
  branding: Record<string, unknown> | null;
  storage: WorkspaceStorageInfo;
  security: WorkspaceSecurityInfo;
}

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  return unwrap(apiClient.get("/workspace"));
}

export interface UpdateWorkspaceSettingsValues {
  name?: string;
  timezone?: string;
  logo?: File;
  business_hours?: Record<string, unknown>;
  default_pipeline_id?: number | null;
  notification_defaults?: Record<string, unknown>;
  branding?: Record<string, unknown>;
}

export async function updateWorkspaceSettings(
  values: UpdateWorkspaceSettingsValues
): Promise<WorkspaceSettings> {
  // Logo uploads go through their own multipart-only request (mixing JSON
  // array fields like business_hours into multipart form fields would
  // require them to arrive as JSON strings, which the backend's `array`
  // validation rule does not auto-parse) - all other fields are sent as a
  // plain JSON PATCH.
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
