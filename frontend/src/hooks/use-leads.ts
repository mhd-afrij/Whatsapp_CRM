'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLead, deleteLead, fetchLead, fetchLeads, updateLead, type Lead, type LeadFilters, type LeadFormValues } from '@/lib/leads-api';

export const leadsKey = (filters: LeadFilters) => ['leads', filters] as const;

export function useLead(id: number) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: () => fetchLead(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

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
    onMutate: async ({ id, stage }) => {
      // Cancel in-flight list refetches so they can't overwrite the optimistic
      // stage change before the server row lands.
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previous = queryClient.getQueriesData<{ data: Lead[] }>({ queryKey: ['leads'] });
      queryClient.setQueriesData<{ data: Lead[] }>({ queryKey: ['leads'] }, (current) => {
        if (!current) return current;
        return { ...current, data: current.data.map((lead) => (lead.id === id ? { ...lead, stage } : lead)) };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (!context?.previous) return;
      for (const [key, data] of context.previous) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: number) => deleteLead(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }) });
}
