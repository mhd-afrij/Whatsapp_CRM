"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { authFetch } from "@/stores/auth-store";
import type { AuditLogEntry } from "@/types/admin";

export default function AuditLogPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => authFetch<AuditLogEntry[]>("/audit-logs"),
  });

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Append-only record of important mutations across the workspace."
      />

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={ScrollText}
          title="Couldn't load the audit log"
          description="You may not have the audit.view permission, or the API is unreachable."
        />
      )}

      {data && data.length === 0 && (
        <EmptyState icon={ScrollText} title="No audit events yet" description="Actions like logins and role changes will appear here." />
      )}

      {data && data.length > 0 && (
        <div className="rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">Action</th>
                <th className="text-left font-medium px-4 py-3">Entity</th>
                <th className="text-left font-medium px-4 py-3">Actor</th>
                <th className="text-left font-medium px-4 py-3">IP address</th>
                <th className="text-left font-medium px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {data.map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3 font-mono text-xs text-text-primary">{entry.action}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {entry.entity_type}
                    {entry.entity_id ? ` #${entry.entity_id}` : ""}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{entry.user?.name ?? "System"}</td>
                  <td className="px-4 py-3 text-text-muted font-mono text-xs">{entry.ip_address ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
