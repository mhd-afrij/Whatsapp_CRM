"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { authFetch } from "@/stores/auth-store";
import type { Customer } from "@/types/admin";

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const customersQuery = useQuery({
    queryKey: ["crm", "customers"],
    queryFn: () => authFetch<Customer[]>("/crm/customers"),
  });

  const selectedCustomer = useMemo(
    () => customersQuery.data?.find((customer) => customer.id === selectedCustomerId) ?? customersQuery.data?.[0] ?? null,
    [customersQuery.data, selectedCustomerId]
  );

  const createCustomer = useMutation({
    mutationFn: (payload: Partial<Customer> & { name: string; stage: string }) =>
      authFetch<Customer>("/crm/customers", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "customers"] }),
  });

  const updateCustomer = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Customer> }) =>
      authFetch<Customer>(`/crm/customers/${id}`, { method: "PATCH", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "customers"] }),
  });

  const archiveCustomer = useMutation({
    mutationFn: (id: number) => authFetch(`/crm/customers/${id}/archive`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "customers"] }),
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: number) => authFetch(`/crm/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "customers"] }),
  });

  const customers = customersQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Live workspace customers from the CRM API."
        actions={<button className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"><Plus size={15} /> Add customer</button>}
      />

      <form
        className="grid gap-3 rounded-[10px] border border-border bg-surface p-4 md:grid-cols-6 mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          createCustomer.mutate({
            name: String(data.get("name") || ""),
            phone: String(data.get("phone") || ""),
            email: String(data.get("email") || ""),
            company: String(data.get("company") || ""),
            stage: String(data.get("stage") || "new"),
            agent_name: String(data.get("agent_name") || ""),
            last_contact_at: String(data.get("last_contact_at") || ""),
          });
          event.currentTarget.reset();
        }}
      >
        <input name="name" placeholder="Customer name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="email" placeholder="Email" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="company" placeholder="Company" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="agent_name" placeholder="Agent name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="last_contact_at" type="datetime-local" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select name="stage" className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2">
          <option value="new">new</option>
          <option value="qualified">qualified</option>
          <option value="negotiation">negotiation</option>
          <option value="won">won</option>
        </select>
        <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground md:col-span-6">Add customer</button>
      </form>

      {selectedCustomer && (
        <form
          className="grid gap-3 rounded-[10px] border border-border bg-surface p-4 md:grid-cols-6 mb-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            updateCustomer.mutate({
              id: selectedCustomer.id,
              payload: {
                name: String(data.get("name") || selectedCustomer.name),
                phone: String(data.get("phone") || selectedCustomer.phone || ""),
                email: String(data.get("email") || selectedCustomer.email || ""),
                company: String(data.get("company") || selectedCustomer.company || ""),
                stage: String(data.get("stage") || selectedCustomer.stage),
                agent_name: String(data.get("agent_name") || selectedCustomer.agent_name || ""),
                last_contact_at: String(data.get("last_contact_at") || selectedCustomer.last_contact_at || ""),
              },
            });
          }}
        >
          <input defaultValue={selectedCustomer.name} name="name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedCustomer.phone ?? ""} name="phone" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedCustomer.email ?? ""} name="email" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedCustomer.company ?? ""} name="company" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedCustomer.agent_name ?? ""} name="agent_name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input defaultValue={selectedCustomer.last_contact_at ?? ""} name="last_contact_at" type="datetime-local" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <select defaultValue={selectedCustomer.stage} name="stage" className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2">
            <option value="new">new</option>
            <option value="qualified">qualified</option>
            <option value="negotiation">negotiation</option>
            <option value="won">won</option>
          </select>
          <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground md:col-span-2" type="submit">Save customer</button>
          <button className="rounded-md border border-border px-3 py-2 text-sm" type="button" onClick={() => archiveCustomer.mutate(selectedCustomer.id)}>Archive</button>
          <button className="rounded-md border border-danger/40 px-3 py-2 text-sm text-danger" type="button" onClick={() => deleteCustomer.mutate(selectedCustomer.id)}>Delete</button>
        </form>
      )}

      {customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" description="Customers will appear once the workspace has active members." />
      ) : (
        <div className="rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Customer</th>
                <th className="text-left font-medium px-4 py-3">Company</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <button type="button" className="text-left" onClick={() => setSelectedCustomerId(customer.id)}>
                      <p className="font-medium text-text-primary">{customer.name}</p>
                      <p className="text-xs text-text-muted">{customer.phone} · {customer.email}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{customer.company}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={customer.stage} tone={customer.stage === "won" ? "success" : customer.stage === "negotiation" ? "warning" : "info"} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{customer.agent_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
