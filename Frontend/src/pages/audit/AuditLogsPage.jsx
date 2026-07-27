import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { authFetch } from "../../store/index.js";
import { EmptyState } from "../../components/common/EmptyState.jsx";
import { formatRelativeTime } from "../../utils/formatDate.js";

export default function AuditLogsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => authFetch("/audit-logs"),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Audit Log</h1>
        <p className="text-sm text-text-muted mt-1">Track all actions and changes across your workspace.</p>
      </div>

      {isLoading && <div className="h-64 rounded-[10px] bg-surface border border-border-muted animate-pulse" />}
      {isError && <EmptyState icon={ScrollText} title="Couldn't load audit logs" description="You may not have the audit.view permission." />}

      {data && data.length === 0 && (
        <EmptyState icon={ScrollText} title="No audit logs yet" description="Actions will appear here as they happen." />
      )}

      {data && data.length > 0 && (
        <div className="rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Action</th>
                <th className="text-left font-medium px-4 py-3">Entity</th>
                <th className="text-left font-medium px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {data.map((log) => (
                <tr key={log.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-surface-raised border border-border flex items-center justify-center text-[10px] font-medium text-text-primary">
                        {log.user?.name?.charAt(0) ?? "?"}
                      </div>
                      <span className="text-text-primary">{log.user?.name ?? "System"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">{log.action}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">{formatRelativeTime(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
