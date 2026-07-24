"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { authFetch } from "@/stores/auth-store";
import type { Lead } from "@/types/admin";

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["crm", "leads"],
    queryFn: () => authFetch<Lead[]>("/crm/leads"),
  });

  const selectedLead = useMemo(
    () => leadsQuery.data?.find((lead) => lead.id === selectedLeadId) ?? leadsQuery.data?.[0] ?? null,
    [leadsQuery.data, selectedLeadId]
  );

  const createLead = useMutation({
    mutationFn: (payload: { title: string; customer_name: string; value?: string; stage: string; agent_name?: string; expected_close_date?: string }) =>
      authFetch<Lead>("/crm/leads", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
  });

  const updateLead = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Lead> }) =>
      authFetch<Lead>(`/crm/leads/${id}`, { method: "PATCH", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
  });

  const archiveLead = useMutation({
    mutationFn: (id: number) => authFetch(`/crm/leads/${id}/archive`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
  });

  const deleteLead = useMutation({
    mutationFn: (id: number) => authFetch(`/crm/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
  });

  const grouped = useMemo(() => {
    const base = Object.fromEntries(STAGES.map((s) => [s, [] as Lead[]]));
    for (const lead of leadsQuery.data ?? []) {
      const key = (lead.stage as (typeof STAGES)[number]) ?? "new";
      (base[key] ?? base.new).push(lead);
    }
    return base as Record<(typeof STAGES)[number], Lead[]>;
  }, [leadsQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline" description="Live CRM leads grouped by stage, backed by the Laravel API." />

      <form
        className="grid gap-3 rounded-[10px] border border-border bg-surface p-4 md:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          createLead.mutate({
            title: String(data.get("title") || ""),
            customer_name: String(data.get("customer_name") || ""),
            value: String(data.get("value") || ""),
            stage: String(data.get("stage") || "new"),
            agent_name: String(data.get("agent_name") || ""),
            expected_close_date: String(data.get("expected_close_date") || ""),
          });
          event.currentTarget.reset();
        }}
      >
        <input name="title" placeholder="Lead title" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="customer_name" placeholder="Customer name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="value" placeholder="Value" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="agent_name" placeholder="Agent name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="expected_close_date" type="date" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select name="stage" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground md:col-span-6" disabled={createLead.isPending}>
          Add lead
        </button>
      </form>

      {selectedLead && (
        <form
          className="grid gap-3 rounded-[10px] border border-border bg-surface p-4 md:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            updateLead.mutate({
              id: selectedLead.id,
              payload: {
                title: String(data.get("title") || selectedLead.title),
                customer_name: String(data.get("customer_name") || selectedLead.customer_name),
                value: String(data.get("value") || selectedLead.value || ""),
                stage: String(data.get("stage") || selectedLead.stage),
                agent_name: String(data.get("agent_name") || selectedLead.agent_name || ""),
                expected_close_date: String(data.get("expected_close_date") || selectedLead.expected_close_date || ""),
              },
            });
          }}
        >
          <input defaultValue={selectedLead.title} name="title" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedLead.customer_name} name="customer_name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedLead.value ?? ""} name="value" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedLead.agent_name ?? ""} name="agent_name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedLead.expected_close_date ?? ""} name="expected_close_date" type="date" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <select defaultValue={selectedLead.stage} name="stage" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground md:col-span-2" type="submit">
            Save lead
          </button>
          <button className="rounded-md border border-border px-3 py-2 text-sm" type="button" onClick={() => archiveLead.mutate(selectedLead.id)}>
            Archive
          </button>
          <button className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger" type="button" onClick={() => deleteLead.mutate(selectedLead.id)}>
            Delete
          </button>
        </form>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((column) => (
          <div key={column} className="w-64 shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">{column}</p>
              <span className="text-xs text-text-muted">{grouped[column].length}</span>
            </div>
            <div className="min-h-[160px] space-y-2 rounded-[10px] border border-border-muted bg-surface p-2">
              {grouped[column].map((lead) => (
                <button key={lead.id} type="button" onClick={() => setSelectedLeadId(lead.id)} className="w-full rounded-[10px] border border-border bg-surface-raised p-3 text-left">
                  <p className="text-sm font-medium text-text-primary">{lead.title}</p>
                  <p className="text-xs text-text-secondary">{lead.customer_name}</p>
                  <p className="mt-2 text-xs font-medium text-primary">{lead.value ?? "—"}</p>
                  <p className="mt-2 text-[10px] text-text-muted">Tap to edit</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
