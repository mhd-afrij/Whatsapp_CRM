import { apiClient, unwrap } from "@/lib/api-client";

export interface ContactTag {
  id: number;
  workspace_id: number;
  name: string;
  color: string;
  description: string | null;
  sort_order: number;
  contacts_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ContactTagFormValues {
  name: string;
  color?: string;
  description?: string | null;
  sort_order?: number;
}

export async function fetchContactTags(): Promise<ContactTag[]> {
  return unwrap(apiClient.get("/contact-tags"));
}

export async function createContactTag(values: ContactTagFormValues): Promise<ContactTag> {
  return unwrap(apiClient.post("/contact-tags", values));
}

export async function updateContactTag(
  id: number,
  values: Partial<ContactTagFormValues>
): Promise<ContactTag> {
  return unwrap(apiClient.patch(`/contact-tags/${id}`, values));
}

export async function deleteContactTag(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/contact-tags/${id}`));
}