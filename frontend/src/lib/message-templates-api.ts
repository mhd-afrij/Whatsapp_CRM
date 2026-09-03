import { apiClient, unwrap } from "@/lib/api-client";

export interface MessageTemplate {
  id: number;
  workspace_id: number;
  name: string;
  shortcut: string | null;
  content: string;
  category: string | null;
  is_active: boolean;
  created_by: number;
  updated_by: number;
  created_at: string;
  updated_at: string;
}

export interface MessageTemplateFormValues {
  name: string;
  shortcut?: string | null;
  content: string;
  category?: string | null;
  is_active?: boolean;
}

export interface TemplatePreviewResult {
  resolvedContent: string;
  body: string;
}

export async function fetchMessageTemplates(params?: {
  category?: string;
  is_active?: boolean;
  search?: string;
  per_page?: number;
}): Promise<MessageTemplate[]> {
  return unwrap(apiClient.get("/message-templates", { params }));
}

export async function fetchMessageTemplate(id: number): Promise<MessageTemplate> {
  return unwrap(apiClient.get(`/message-templates/${id}`));
}

export async function createMessageTemplate(
  values: MessageTemplateFormValues
): Promise<MessageTemplate> {
  return unwrap(apiClient.post("/message-templates", values));
}

export async function updateMessageTemplate(
  id: number,
  values: Partial<MessageTemplateFormValues>
): Promise<MessageTemplate> {
  return unwrap(apiClient.patch(`/message-templates/${id}`, values));
}

export async function deleteMessageTemplate(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/message-templates/${id}`));
}

export async function previewTemplate(
  content: string,
  contactId?: number,
  dealId?: number
): Promise<TemplatePreviewResult> {
  return unwrap(
    apiClient.post("/message-templates/preview", {
      content,
      contact_id: contactId,
      deal_id: dealId,
    })
  );
}
