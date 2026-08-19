"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  assignLead,
  bulkAssignLeads,
  bulkChangeStage,
  bulkTagLeads,
  changeLeadStage,
  convertLead,
  convertContactToLead,
  convertConversationToLead,
  createLead,
  deleteLead,
  fetchLead,
  fetchLeadActivities,
  fetchLeadTasks,
  fetchLeads,
  markLeadLost,
  updateLead,
  type LeadConvertValues,
  type LeadFilters,
  type LeadFormValues,
  type LeadLostValues,
  type LeadStage,
} from "@/lib/leads-api";

export const leadsKey = (filters: LeadFilters) => ["leads", filters] as const;
export const leadKey = (id: number) => ["leads", "detail", id] as const;
export const leadActivitiesKey = (id: number) => ["leads", "activities", id] as const;
export const leadTasksKey = (id: number) => ["leads", "tasks", id] as const;

// ── Queries ────────────────────────────────────────────────────────────

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

export function useLeadActivities(id: number, page = 1) {
  return useQuery({
    queryKey: [...leadActivitiesKey(id), page] as const,
    queryFn: () => fetchLeadActivities(id, page),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useLeadTasks(id: number) {
  return useQuery({
    queryKey: leadTasksKey(id),
    queryFn: () => fetchLeadTasks(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadFormValues) => createLead(values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useUpdateLead(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadFormValues) => updateLead(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: leadKey(id) });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useChangeLeadStage(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, stage, lostReason, lostNotes }: { leadId?: number; stage: LeadStage; lostReason?: string; lostNotes?: string }) =>
      changeLeadStage(leadId ?? id, stage, lostReason as any, lostNotes),
    onSuccess: (_data, variables) => {
      const leadId = variables.leadId ?? id;
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: leadKey(leadId) });
      qc.invalidateQueries({ queryKey: leadActivitiesKey(leadId) });
    },
  });
}

export function useAssignLead(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: { owner_user_id?: number | null; assigned_team_id?: number | null }) =>
      assignLead(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: leadKey(id) });
    },
  });
}

export function useConvertLead(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadConvertValues) => convertLead(id, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: leadKey(id) });
      qc.invalidateQueries({ queryKey: leadActivitiesKey(id) });
    },
  });
}

export function useMarkLeadLost(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, ...values }: { leadId?: number } & LeadLostValues) => markLeadLost(leadId ?? id, values),
    onSuccess: (_data, variables) => {
      const leadId = variables.leadId ?? id;
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: leadKey(leadId) });
      qc.invalidateQueries({ queryKey: leadActivitiesKey(leadId) });
    },
  });
}

// ── Bulk mutations ─────────────────────────────────────────────────────

export function useBulkAssignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadIds, ...values }: { leadIds: number[]; owner_user_id?: number | null; assigned_team_id?: number | null }) =>
      bulkAssignLeads(leadIds, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useBulkChangeStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadIds, stage }: { leadIds: number[]; stage: LeadStage }) =>
      bulkChangeStage(leadIds, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useBulkTagLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadIds, labelIds, action }: { leadIds: number[]; labelIds: number[]; action: "attach" | "detach" }) =>
      bulkTagLeads(leadIds, labelIds, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// ── Legacy conversion helpers ──────────────────────────────────────────

export function useConvertContactToLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: number) => convertContactToLead(contactId),
    onSuccess: (_data, contactId) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts", "detail", contactId] });
    },
  });
}

export function useConvertConversationToLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: number) => convertConversationToLead(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
