import { apiClient } from './api-client';

export interface CustomFieldOption {
  label: string;
  value: string;
}

export interface CustomFieldDefinition {
  id: number;
  workspace_id: number;
  entity_type: string;
  name: string;
  key: string;
  field_type: 'text' | 'number' | 'select' | 'date' | 'boolean';
  options: CustomFieldOption[] | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldDefinitionFormValues {
  entity_type: string;
  name: string;
  field_type: string;
  options?: CustomFieldOption[];
  is_required?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export async function fetchCustomFieldDefinitions(entityType = 'contact'): Promise<CustomFieldDefinition[]> {
  const response = await apiClient.get('/custom-field-definitions', {
    params: { entity_type: entityType },
  });
  return response.data.data;
}

export async function createCustomFieldDefinition(data: CustomFieldDefinitionFormValues): Promise<CustomFieldDefinition> {
  const response = await apiClient.post('/custom-field-definitions', data);
  return response.data.data;
}

export async function updateCustomFieldDefinition(
  id: number,
  data: Partial<CustomFieldDefinitionFormValues>
): Promise<CustomFieldDefinition> {
  const response = await apiClient.patch(`/custom-field-definitions/${id}`, data);
  return response.data.data;
}

export async function deleteCustomFieldDefinition(id: number): Promise<void> {
  await apiClient.delete(`/custom-field-definitions/${id}`);
}
