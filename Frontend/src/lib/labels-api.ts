import { apiClient, unwrap } from "@/lib/api-client";
import type { LabelSummary } from "@/lib/conversations-api";

export type LabelEntityType = "contacts" | "deals" | "conversations";

export interface LabelFormValues {
  name: string;
  color_hex: string;
}

export async function fetchLabels(): Promise<LabelSummary[]> {
  return unwrap(apiClient.get("/labels"));
}

export async function createLabel(values: LabelFormValues): Promise<LabelSummary> {
  return unwrap(apiClient.post("/labels", values));
}

export async function updateLabel(
  id: number,
  values: Partial<LabelFormValues>
): Promise<LabelSummary> {
  return unwrap(apiClient.patch(`/labels/${id}`, values));
}

export async function deleteLabel(id: number): Promise<null> {
  return unwrap(apiClient.delete(`/labels/${id}`));
}

/**
 * Attach/detach follow the per-entity nested routes (contacts/{id}/labels/{label},
 * deals/{id}/labels/{label}, conversations/{id}/labels/{label}) -
 * the pivot tables (contact_label/deal_label/conversation_label) are separate,
 * non-polymorphic tables per docs/04-database-design.md, so there's no single generic endpoint.
 */
export async function attachLabelTo(
  entity: LabelEntityType,
  entityId: number,
  labelId: number
): Promise<unknown> {
  return unwrap(apiClient.post(`/${entity}/${entityId}/labels/${labelId}`));
}

export async function detachLabelFrom(
  entity: LabelEntityType,
  entityId: number,
  labelId: number
): Promise<unknown> {
  return unwrap(apiClient.delete(`/${entity}/${entityId}/labels/${labelId}`));
}
