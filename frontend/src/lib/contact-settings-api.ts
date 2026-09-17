import { apiClient, unwrap } from "@/lib/api-client";

export interface ContactLifecycleStatus {
  key: string;
  label: string;
  color: string;
  enabled: boolean;
  is_default: boolean;
}

export interface ContactSettings {
  identification: {
    name_format: "first_last" | "last_first" | "single";
    default_country_code: string;
    primary_identifier: "phone" | "email" | "whatsapp_id";
    require_phone: boolean;
    require_email: boolean;
    require_name: boolean;
  };
  whatsapp_creation: {
    auto_create: boolean;
    update_from_profile: boolean;
    save_profile_name: boolean;
    save_number: boolean;
  };
  ownership: {
    default_owner_user_id: number | null;
    default_team_id: number | null;
    allow_unassigned: boolean;
  };
  data_management: {
    allow_csv_import: boolean;
    allow_export: boolean;
    allow_archive: boolean;
    restrict_permanent_delete: boolean;
  };
  lifecycle: {
    statuses: ContactLifecycleStatus[];
  };
  duplicates: {
    match_phone: boolean;
    match_email: boolean;
    match_whatsapp_id: boolean;
    strategy: "warn_only" | "prevent_creation" | "auto_merge";
  };
}

export async function fetchContactSettings(): Promise<{ settings: ContactSettings }> {
  return unwrap(apiClient.get("/settings/contacts"));
}

export async function updateContactSettings(
  values: Partial<ContactSettings>
): Promise<{ settings: ContactSettings }> {
  return unwrap(apiClient.patch("/settings/contacts", values));
}