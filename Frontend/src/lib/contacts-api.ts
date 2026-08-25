import { apiClient, unwrap } from "@/lib/api-client";
import type { LabelSummary, Paginated, UserSummary } from "@/lib/conversations-api";

export interface WhatsappContactDetail {
  id: number;
  wa_jid: string;
  push_name: string | null;
  /** Saved (address-book) name for this number - preferred over push_name when present. */
  contact_name?: string | null;
  phone_number: string | null;
  profile_picture_url: string | null;
  is_business: boolean;
  last_seen_at: string | null;
}

export interface ConversationSummary {
  id: number;
  status: "open" | "pending" | "closed";
  last_message_at: string | null;
  last_message_preview: string | null;
}

export interface ContactActivity {
  id: number;
  activity_type: string;
  description: string | null;
  occurred_at: string;
  created_by: number | null;
}

export interface DealSummary {
  id: number;
  title: string;
  status: string;
  value_amount: string | number | null;
  value_currency: string;
}

export type ContactStatus = "active" | "inactive";

export type ContactPriority = "low" | "normal" | "high" | "urgent";

export type ContactSource = "whatsapp" | "manual" | "import" | "other" | string;

export interface Contact {
  id: number;
  workspace_id: number;
  whatsapp_contact_id: number | null;
  full_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  phone_number: string | null;
  normalized_phone_number: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  status: ContactStatus;
  priority: ContactPriority;
  source: ContactSource | null;
  last_contacted_at: string | null;
  custom_fields: Record<string, unknown> | null;
  owner_user_id: number | null;
  owner: UserSummary | null;
  whatsapp_contact: WhatsappContactDetail | null;
  labels: LabelSummary[];
  conversations?: ConversationSummary[];
  activities?: ContactActivity[];
  deals?: DealSummary[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContactFilters {
  search?: string;
  status?: ContactStatus;
  source?: ContactSource;
  country?: string;
  whatsapp?: "connected" | "unavailable";
  recently_contacted?: boolean;
  owner_user_id?: number;
  archived?: boolean;
  sort?: "full_name" | "email" | "company" | "created_at" | "updated_at" | "last_contacted_at" | "status";
  direction?: "asc" | "desc";
  per_page?: number;
  page?: number;
  /** Any-match (OR) - matching one of these label ids is enough (see backend SearchController/ContactController docblocks for the rationale). */
  labels?: number[];
}

export interface ContactFormValues {
  full_name?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  phone_number?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  status?: ContactStatus | null;
  priority?: ContactPriority | null;
  source?: ContactSource | null;
  owner_user_id?: number | null;
  custom_fields?: Record<string, unknown> | null;
}

interface PaginatedApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  meta?: Paginated<T>["meta"] | null;
}

async function unwrapPaginated<T>(
  promise: Promise<{ data: PaginatedApiResponse<T> }>
): Promise<Paginated<T>> {
  const { data: body } = await promise;
  if (!body.success) {
    throw new Error(body.message ?? "Request failed");
  }
  return { data: body.data, meta: body.meta ?? { per_page: 0, has_more: false } };
}

export async function fetchContacts(filters: ContactFilters): Promise<Paginated<Contact>> {
  return unwrapPaginated<Contact>(apiClient.get("/contacts", { params: filters }));
}

export async function fetchContact(id: number): Promise<Contact> {
  return unwrap(apiClient.get(`/contacts/${id}`));
}

export async function createContact(values: ContactFormValues): Promise<{ contact: Contact; duplicate_of: Contact | null }> {
  return unwrap(apiClient.post("/contacts", values));
}

export async function updateContact(id: number, values: ContactFormValues): Promise<Contact> {
  return unwrap(apiClient.patch(`/contacts/${id}`, values));
}

export async function archiveContact(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/contacts/${id}`));
}

export interface DuplicateMergeDetail {
  workspace_id: number;
  phone: string;
  kept: number;
  kept_name: string | null;
  merged: number[];
}

export interface DuplicateMergeReport {
  groups: number;
  merged: number;
  deleted: number;
  details: DuplicateMergeDetail[];
}

/**
 * Merges duplicate contacts (same workspace + normalized phone) created
 * before phone-based dedup was enforced on the WhatsApp path. Pass
 * dryRun=true to preview the groups without changing anything.
 */
export async function mergeDuplicateContacts(dryRun: boolean): Promise<DuplicateMergeReport> {
  return unwrap(apiClient.post("/contacts/merge-duplicates", { dry_run: dryRun }));
}

export async function restoreContact(id: number): Promise<Contact> {
  return unwrap(apiClient.post(`/contacts/${id}/restore`));
}

export interface ImportRowResult {
  row: number;
  contact_id?: number;
  data?: Record<string, unknown>;
  errors?: string[];
  duplicate_of_contact_id?: number;
  phone_number?: string | null;
}

export interface ImportReport {
  created: ImportRowResult[];
  failed: ImportRowResult[];
  duplicates: ImportRowResult[];
}

export async function importContacts(file: File): Promise<ImportReport> {
  const form = new FormData();
  form.append("file", file);
  return unwrap(
    apiClient.post("/contacts/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
}

/**
 * The export endpoint requires the bearer token, so a plain `<a href>` can't
 * be used (no way to attach an Authorization header to a browser navigation).
 * Fetches the CSV as a blob and triggers a client-side download instead.
 */
export async function downloadContactsExport(): Promise<void> {
  const response = await apiClient.get("/contacts/export", { responseType: "blob" });
  const blob = new Blob([response.data], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "contacts.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
