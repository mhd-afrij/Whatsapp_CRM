"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  archiveContact,
  createContact,
  fetchContact,
  fetchContacts,
  importContacts,
  restoreContact,
  updateContact,
  type ContactFilters,
  type ContactFormValues,
} from "@/lib/contacts-api";

export const contactsKey = (filters: ContactFilters) => ["contacts", filters] as const;
export const contactKey = (id: number) => ["contacts", "detail", id] as const;

export function useContactList(filters: ContactFilters) {
  return useQuery({
    queryKey: contactsKey(filters),
    queryFn: () => fetchContacts(filters),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: number) {
  return useQuery({
    queryKey: contactKey(id),
    queryFn: () => fetchContact(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => createContact(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => updateContact(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: contactKey(id) });
    },
  });
}

export function useArchiveContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useRestoreContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => restoreContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importContacts(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
