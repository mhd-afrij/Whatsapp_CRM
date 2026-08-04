"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  convertContactToLead,
  convertConversationToLead,
  createLead,
  deleteLead,
  fetchLead,
  fetchLeads,
  updateLead,
  type LeadFilters,
  type LeadFormValues,
} from "@/lib/leads-api";

export const leadsKey = (filters: LeadFilters) => ["leads", filters] as const;
export const leadKey = (id: number) => ["leads", "detail", id] as const;

export function useLeadList(filters: LeadFilters) {
  return useQuery({
    queryKey: leadsKey(filters),
    queryFn: () => fetchLeads(filters),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: number) {
  return useQuery({
    queryKey: leadKey(id),
    queryFn: () => fetchLead(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadFormValues) => createLead(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useUpdateLead(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadFormValues) => updateLead(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: leadKey(id) });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useConvertContactToLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: number) => convertContactToLead(contactId),
    onSuccess: (_data, contactId) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", "detail", contactId] });
    },
  });
}

export function useConvertConversationToLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: number) => convertConversationToLead(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
