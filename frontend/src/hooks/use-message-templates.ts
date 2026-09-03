"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  fetchMessageTemplates,
  updateMessageTemplate,
  type MessageTemplateFormValues,
} from "@/lib/message-templates-api";

export const messageTemplatesKey = ["message-templates"] as const;

export function useMessageTemplates(params?: {
  category?: string;
  is_active?: boolean;
  search?: string;
}) {
  return useQuery({
    queryKey: [...messageTemplatesKey, params],
    queryFn: () => fetchMessageTemplates(params),
  });
}

export function useCreateMessageTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: MessageTemplateFormValues) => createMessageTemplate(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messageTemplatesKey }),
  });
}

export function useUpdateMessageTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<MessageTemplateFormValues> }) =>
      updateMessageTemplate(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messageTemplatesKey }),
  });
}

export function useDeleteMessageTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMessageTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messageTemplatesKey }),
  });
}
