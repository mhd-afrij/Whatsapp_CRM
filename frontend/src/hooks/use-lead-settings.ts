"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLeadAssignmentRule,
  createLeadAutomation,
  createLeadScoringRule,
  createLeadSource,
  createLeadStatus,
  deleteLeadAssignmentRule,
  deleteLeadAutomation,
  deleteLeadScoringRule,
  deleteLeadSource,
  deleteLeadStatus,
  fetchLeadAssignmentRules,
  fetchLeadAutomations,
  fetchLeadScoringRules,
  fetchLeadSettings,
  fetchLeadSources,
  fetchLeadStatuses,
  reorderLeadAssignmentRules,
  reorderLeadSources,
  reorderLeadStatuses,
  setLeadAutomationActive,
  updateLeadAssignmentRule,
  updateLeadAutomation,
  updateLeadScoringRule,
  updateLeadSettings,
  updateLeadSettingsSection,
  updateLeadSource,
  updateLeadStatus,
  type LeadAssignmentRuleFormValues,
  type LeadAutomationFormValues,
  type LeadScoringRuleFormValues,
  type LeadSettings,
  type LeadSourceFormValues,
  type LeadStatusFormValues,
} from "@/lib/lead-settings-api";

export const leadSettingsKey = ["lead-settings"] as const;
export const leadStatusesKey = ["lead-statuses"] as const;
export const leadSourcesKey = ["lead-sources"] as const;
export const leadAssignmentRulesKey = ["lead-assignment-rules"] as const;
export const leadScoringRulesKey = ["lead-scoring-rules"] as const;
export const leadAutomationsKey = ["lead-automations"] as const;

export function useLeadSettings() {
  return useQuery({
    queryKey: leadSettingsKey,
    queryFn: fetchLeadSettings,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateLeadSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<LeadSettings>) => updateLeadSettings(values),
    onSuccess: (result) => queryClient.setQueryData(leadSettingsKey, result),
  });
}

export function useUpdateLeadSettingsSection(section: "assignment" | "scoring" | "conversion") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) => updateLeadSettingsSection(section, values),
    onSuccess: (result) => queryClient.setQueryData(leadSettingsKey, result),
  });
}

// --- Statuses ---

export function useLeadStatuses() {
  return useQuery({ queryKey: leadStatusesKey, queryFn: fetchLeadStatuses });
}

export function useCreateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadStatusFormValues) => createLeadStatus(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [leadStatusesKey, leadSettingsKey] });
    },
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<LeadStatusFormValues> }) =>
      updateLeadStatus(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [leadStatusesKey, leadSettingsKey] });
    },
  });
}

export function useDeleteLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replacementStatusId }: { id: number; replacementStatusId: number }) =>
      deleteLeadStatus(id, replacementStatusId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [leadStatusesKey, leadSettingsKey] }),
  });
}

export function useReorderLeadStatuses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => reorderLeadStatuses(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadStatusesKey }),
  });
}

// --- Sources ---

export function useLeadSources() {
  return useQuery({ queryKey: leadSourcesKey, queryFn: fetchLeadSources });
}

export function useCreateLeadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadSourceFormValues) => createLeadSource(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [leadSourcesKey, leadSettingsKey] }),
  });
}

export function useUpdateLeadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<LeadSourceFormValues> }) =>
      updateLeadSource(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [leadSourcesKey, leadSettingsKey] }),
  });
}

export function useDeleteLeadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLeadSource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [leadSourcesKey, leadSettingsKey] }),
  });
}

export function useReorderLeadSources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => reorderLeadSources(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadSourcesKey }),
  });
}

// --- Assignment rules ---

export function useLeadAssignmentRules() {
  return useQuery({ queryKey: leadAssignmentRulesKey, queryFn: fetchLeadAssignmentRules });
}

export function useCreateLeadAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadAssignmentRuleFormValues) => createLeadAssignmentRule(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAssignmentRulesKey }),
  });
}

export function useUpdateLeadAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<LeadAssignmentRuleFormValues> }) =>
      updateLeadAssignmentRule(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAssignmentRulesKey }),
  });
}

export function useDeleteLeadAssignmentRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLeadAssignmentRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAssignmentRulesKey }),
  });
}

export function useReorderLeadAssignmentRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => reorderLeadAssignmentRules(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAssignmentRulesKey }),
  });
}

// --- Scoring rules ---

export function useLeadScoringRules() {
  return useQuery({ queryKey: leadScoringRulesKey, queryFn: fetchLeadScoringRules });
}

export function useCreateLeadScoringRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadScoringRuleFormValues) => createLeadScoringRule(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadScoringRulesKey }),
  });
}

export function useUpdateLeadScoringRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<LeadScoringRuleFormValues> }) =>
      updateLeadScoringRule(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadScoringRulesKey }),
  });
}

export function useDeleteLeadScoringRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLeadScoringRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadScoringRulesKey }),
  });
}

// --- Automations ---

export function useLeadAutomations() {
  return useQuery({ queryKey: leadAutomationsKey, queryFn: fetchLeadAutomations });
}

export function useCreateLeadAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LeadAutomationFormValues) => createLeadAutomation(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAutomationsKey }),
  });
}

export function useUpdateLeadAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: number; values: Partial<LeadAutomationFormValues> }) =>
      updateLeadAutomation(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAutomationsKey }),
  });
}

export function useDeleteLeadAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLeadAutomation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAutomationsKey }),
  });
}

export function useSetLeadAutomationActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setLeadAutomationActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadAutomationsKey }),
  });
}