"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContactTag,
  deleteContactTag,
  fetchContactTags,
  updateContactTag,
  type ContactTagFormValues,
} from "@/lib/contact-tags-api";

export const contactTagsKey = ["contact-tags"] as const;

export function useContactTags() {
  return useQuery({
    queryKey: contactTagsKey,
    queryFn: fetchContactTags,
  });
}

export function useCreateContactTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactTagFormValues) => createContactTag(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactTagsKey }),
  });
}

export function useUpdateContactTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<ContactTagFormValues> }) =>
      updateContactTag(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactTagsKey }),
  });
}

export function useDeleteContactTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteContactTag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactTagsKey }),
  });
}