"use client";

import { Download, FileSpreadsheet, FileText, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { secondary } from "@/components/settings/styles";
import { usePermission } from "@/hooks/use-permission";
import {
  useDownloadReportExport,
  useQueueReportExport,
  useReportExports,
  useRetryReportExport,
} from "@/hooks/use-reports";
import { shortDate } from "@/lib/report-format";
import type { ReportExportRecord, ReportExportType } from "@/lib/reports-api";
import { useToast } from "@/providers/toast-provider";

const EXPORT_BUTTONS: Array<{ type: ReportExportType; label: string; description: string; icon: React.ComponentType<{ className?: string }>; pdf?: boolean }> = [
  { type: "daily_metrics", label: "Daily metrics", description: "CSV", icon: FileSpreadsheet },
  { type: "agent_summary", label: "Agent summary", description: "CSV", icon: FileSpreadsheet },
  { type: "full_pdf", label: "Full report", description: "PDF", icon: FileText, pdf: true },
];

const STATUS_LABELS: Record<ReportExportRecord["status"], string> = {
  queued: "Queued",
  processing: "Preparing…",
  ready: "Ready",
  failed: "Failed",
};

function statusClasses(status: ReportExportRecord["status"]): string {
  switch (status) {
    case "ready":
      return "bg-success/10 text-success";
    case "failed":
      return "bg-danger/10 text-danger";
    default:
      return "bg-muted/40 text-muted";
  }
}

export function ExportsSection() {
  const { toast } = useToast();
  const canExport = usePermission("reports.export");
  const exportsQuery = useReportExports();
  const queueExport = useQueueReportExport();
  const retryExport = useRetryReportExport();
  const download = useDownloadReportExport();

  if (!canExport) return null;

  const exports = exportsQuery.data ?? [];

  const handleQueue = async (type: ReportExportType) => {
    try {
      await queueExport.mutateAsync(type);
      toast("Export queued — you'll be notified when it's ready.", "success");
    } catch {
      toast("Couldn't queue the export.", "error");
    }
  };

  const handleDownload = async (record: ReportExportRecord) => {
    try {
      await download.mutateAsync({ id: record.id, fileName: record.file_name ?? `export-${record.id}` });
    } catch {
      toast("Couldn't download the export.", "error");
    }
  };

  const busy = queueExport.isPending || retryExport.isPending || download.isPending || exportsQuery.isFetching;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text">Exports</h2>
          <p className="mt-0.5 text-xs text-muted">
            Backgound reports are generated on a queue and delivered here when ready.
          </p>
        </div>
        {exports.length > 0 && (
          <span className="rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
            {exports.length} recent
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXPORT_BUTTONS.map(({ type, label, description, icon: Icon, pdf }) => (
          <button
            key={type}
            type="button"
            disabled={busy}
            onClick={() => handleQueue(type)}
            className={cn(secondary, "h-9 text-xs", pdf && "text-primary")}
          >
            <Icon className="h-4 w-4" />
            {label} · {description}
          </button>
        ))}
      </div>

      {exportsQuery.isError ? (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          Couldn&apos;t load your exports. Try refreshing.
        </p>
      ) : exports.length === 0 ? (
        <p className="mt-4 text-xs text-muted">No exports yet — queue one above and it will appear here.</p>
      ) : (
        <div className="mt-4 -mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="border-b border-border px-3 py-2">Export</th>
                <th className="border-b border-border px-3 py-2">Created</th>
                <th className="border-b border-border px-3 py-2">Rows</th>
                <th className="border-b border-border px-3 py-2">Status</th>
                <th className="border-b border-border px-3 py-2 text-right">Download</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((record) => {
                const pending = record.status === "queued" || record.status === "processing";
                const failed = record.status === "failed";
                return (
                  <tr key={record.id}>
                    <td className="border-b border-border/60 px-3 py-2.5 font-medium text-text">
                      {record.type}
                      {record.error_message && (
                        <p className="mt-0.5 max-w-64 truncate text-[11px] font-normal text-danger" title={record.error_message}>
                          {record.error_message}
                        </p>
                      )}
                    </td>
                    <td className="border-b border-border/60 px-3 py-2.5 tabular-nums text-muted">
                      {shortDate(record.created_at.slice(0, 10))}
                    </td>
                    <td className="border-b border-border/60 px-3 py-2.5 text-right tabular-nums text-muted">
                      {record.row_count ?? "–"}
                    </td>
                    <td className="border-b border-border/60 px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", statusClasses(record.status))}>
                        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                        {STATUS_LABELS[record.status]}
                      </span>
                    </td>
                    <td className="border-b border-border/60 px-3 py-2.5 text-right">
                      {record.status === "ready" && (
                        <button
                          type="button"
                          onClick={() => handleDownload(record)}
                          disabled={download.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text transition hover:bg-bg disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Open
                        </button>
                      )}
                      {failed && (
                        <button
                          type="button"
                          onClick={() => retryExport.mutate(record.id)}
                          disabled={retryExport.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text transition hover:bg-bg disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}