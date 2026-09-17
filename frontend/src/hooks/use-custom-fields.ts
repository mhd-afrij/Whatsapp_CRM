"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  fetchCustomFieldDefinitions,
  updateCustomFieldDefinition,
  type CustomFieldDefinition,
  type CustomFieldDefinitionFormValues,
} from "@/lib/custom-fields-api";

export const customFieldsKey = ["custom-field-definitions"] as const;

export function useCustomFieldDefinitions(entityType = "contact") {
  return useQuery({
    queryKey: [...customFieldsKey, entityType],
    queryFn: () => fetchCustomFieldDefinitions(entityType),
  });
}

export function useCreateCustomFieldDefinition(entityType = "contact") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CustomFieldDefinitionFormValues) => createCustomFieldDefinition(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldsKey }),
  });
}

export function useUpdateCustomFieldDefinition(entityType = "contact") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<CustomFieldDefinitionFormValues> }) =>
      updateCustomFieldDefinition(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldsKey }),
  });
}

export function useDeleteCustomFieldDefinition(entityType = "contact") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCustomFieldDefinition(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customFieldsKey }),
  });
}

export function fieldTypeLabel(type: CustomFieldDefinition["field_type"]): string {
  const labels: Record<CustomFieldDefinition["field_type"], string> = {
    text: "Text",
    number: "Number",
    select: "Select",
    date: "Date",
    boolean: "Yes / No",
  };
  return labels[type] ?? type;
}
