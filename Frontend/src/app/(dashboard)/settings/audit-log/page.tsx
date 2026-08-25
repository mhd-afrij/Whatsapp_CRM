"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useAuditLog, useAuditLogs } from "@/hooks/use-audit-logs";
import { useUsers } from "@/hooks/use-users";
import type { AuditLogListParams } from "@/lib/audit-log-api";
import { ErrorState } from "@/components/ui/error-state";

function DiffBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</h4>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-bg p-3 text-xs text-text">
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AuditLogDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: log, isLoading } = useAuditLog(id);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Audit log entry #{id}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !log ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Action</dt>
              <dd className="text-text">{log.action}</dd>
              <dt className="text-muted">Actor</dt>
              <dd className="text-text">{log.actor ? `${log.actor.name} (${log.actor.email})` : "System"}</dd>
              <dt className="text-muted">Entity</dt>
              <dd className="text-text">
                {log.subject_type ? `${log.subject_type.split("\\").pop()} #${log.subject_id}` : "—"}
              </dd>
              <dt className="text-muted">Timestamp</dt>
              <dd className="text-text">{new Date(log.created_at).toLocaleString()}</dd>
              <dt className="text-muted">IP address</dt>
              <dd className="text-text">{log.ip_address ?? "—"}</dd>
              <dt className="text-muted">User agent</dt>
              <dd className="break-all text-text">{log.user_agent ?? "—"}</dd>
            </dl>

            <DiffBlock label="Before" value={log.before} />
            <DiffBlock label="After / recorded changes" value={log.after} />
          </div>
        )}
      </div>
    </div>
  );
}

function AuditLogContent() {
  const [filters, setFilters] = useState<AuditLogListParams>({ page: 1, per_page: 25 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: users } = useUsers();
  const { data, isLoading, isError, refetch } = useAuditLogs(filters);

  const setFilter = (patch: Partial<AuditLogListParams>) =>
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Audit Log</h1>
        <p className="text-sm text-muted">
          Every gated action across the workspace, with actor, IP, and change detail.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-3">
        <div>
          <label className="block text-xs text-muted">From</label>
          <input
            type="date"
            onChange={(e) => setFilter({ date_from: e.target.value || undefined })}
            className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-xs text-muted">To</label>
          <input
            type="date"
            onChange={(e) => setFilter({ date_to: e.target.value || undefined })}
            className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Actor</label>
          <select
            onChange={(e) => setFilter({ user_id: e.target.value ? Number(e.target.value) : undefined })}
            className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          >
            <option value="">All</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted">Action</label>
          <input
            type="text"
            placeholder="e.g. role.updated"
            onChange={(e) => setFilter({ action: e.target.value || undefined })}
            className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Entity type</label>
          <input
            type="text"
            placeholder="e.g. Role"
            onChange={(e) => setFilter({ subject_type: e.target.value || undefined })}
            className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading audit log…</p>}
      {isError && (
        <ErrorState message="Unable to load audit log." onRetry={() => refetch()} />
      )}

      {data && data.data.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          No audit log entries match these filters.
        </p>
      )}

      {data && data.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className="cursor-pointer border-t border-border bg-bg hover:bg-primary-soft/40"
                >
                  <td className="px-3 py-2 text-text">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-text">{entry.actor?.name ?? "System"}</td>
                  <td className="px-3 py-2 text-text">{entry.action}</td>
                  <td className="px-3 py-2 text-text">
                    {entry.subject_type ? `${entry.subject_type.split("\\").pop()} #${entry.subject_id}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-text">{entry.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {data.meta.current_page} of {data.meta.last_page} ({data.meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={data.meta.current_page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
              className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={data.meta.current_page >= data.meta.last_page}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
              className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedId !== null && (
        <AuditLogDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

export default function AuditLogPage() {
  return (
    <RequirePermission permission="audit_logs.view">
      <AuditLogContent />
    </RequirePermission>
  );
}
