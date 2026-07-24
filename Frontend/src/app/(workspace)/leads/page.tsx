"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { authFetch } from "@/stores/auth-store";
import type { TeamMember } from "@/types/admin";

export default function LeadsPage() {
  const { data: leads = [] } = useQuery({
    queryKey: ["leads", "team"],
    queryFn: () => authFetch<TeamMember[]>("/users"),
  });

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Live workspace people list mapped into a lightweight lead board."
        actions={
          <button className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
            <Plus size={15} /> New lead
          </button>
        }
      />

      <div className="rounded-[10px] border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-3">Lead</th>
              <th className="text-left font-medium px-4 py-3">Email</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-left font-medium px-4 py-3">Roles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-surface-hover">
                <td className="px-4 py-3 font-medium text-text-primary">{lead.name}</td>
                <td className="px-4 py-3 text-text-secondary">{lead.email}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={lead.status} tone={lead.status === "active" ? "success" : lead.status === "suspended" ? "danger" : "neutral"} />
                </td>
                <td className="px-4 py-3 text-text-secondary">{lead.roles.map((role) => role.name).join(", ") || "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
