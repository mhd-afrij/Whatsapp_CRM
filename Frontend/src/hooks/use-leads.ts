'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLead, deleteLead, fetchLeads, updateLead, type LeadFilters, type LeadFormValues } from '@/lib/leads-api';

export const leadsKey = (filters: LeadFilters) => ['leads', filters] as const;

export function useLeadList(filters: LeadFilters) {
  return useQuery({ queryKey: leadsKey(filters), queryFn: () => fetchLeads(filters), placeholderData: keepPreviousData });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (values: LeadFormValues) => createLead(values), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }) });
}

export function useUpdateLead(id: number) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (values: Partial<LeadFormValues>) => updateLead(id, values), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }) });
}

export function useMoveLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) => updateLead(id, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: number) => deleteLead(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }) });
}
