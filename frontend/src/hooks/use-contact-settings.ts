"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchContactSettings,
  updateContactSettings,
  type ContactSettings,
} from "@/lib/contact-settings-api";

export const contactSettingsKey = ["contact-settings"] as const;

export function useContactSettings() {
  return useQuery({
    queryKey: contactSettingsKey,
    queryFn: fetchContactSettings,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateContactSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<ContactSettings>) => updateContactSettings(values),
    onSuccess: (result) => {
      queryClient.setQueryData(contactSettingsKey, result);
    },
  });
}