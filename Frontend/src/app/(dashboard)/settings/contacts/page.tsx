"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Merge, ScanSearch, ShieldAlert } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useMergeDuplicateContacts } from "@/hooks/use-contacts";
import { ApiError } from "@/lib/api-client";
import type { DuplicateMergeReport } from "@/lib/contacts-api";

function DuplicateContactsManager() {
  const mergeMutation = useMergeDuplicateContacts();
  const [report, setReport] = useState<DuplicateMergeReport | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runMerge = async (preview: boolean) => {
    setError(null);
    try {
      const result = await mergeMutation.mutateAsync(preview);
      setReport(result);
      setDryRun(preview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to run the duplicate check.");
    }
  };

  const onScan = () => {
    setReport(null);
    void runMerge(true);
  };

  const onMerge = async () => {
    if (!report || report.details.length === 0) return;
    const total = report.details.reduce((sum, d) => sum + d.merged.length, 0);
    if (
      !window.confirm(
        `Merge ${total} duplicate contact(s) into ${report.details.length} primary contact(s)? ` +
          "Every linked conversation, deal, task, note, and label will be re-pointed to the " +
          "kept contact, and the duplicates will be permanently deleted. This cannot be undone."
      )
    ) {
      return;
    }
    await runMerge(false);
  };

  const pendingCount = report
    ? report.details.reduce((sum, d) => sum + d.merged.length, 0)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Duplicate Contacts</h1>
        <p className="mt-1 text-sm text-muted">
          Contacts are matched by their normalized phone number. When a WhatsApp reply arrives
          from a number that was already saved, it should attach to the existing contact — but
          duplicates created before this dedup was in place can still exist. Scan to find them,
          then merge: the manually-saved contact wins, and every conversation, deal, task,
          note, and label is re-pointed to it.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Merge by normalized phone number</h2>
            <p className="mt-0.5 text-xs text-muted">
              Groups of contacts sharing the same phone number within this workspace.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onScan}
              disabled={mergeMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-primary-soft/40 disabled:opacity-60"
            >
              <ScanSearch className="h-4 w-4" />
              {mergeMutation.isPending && !report ? "Scanning…" : "Scan for duplicates"}
            </button>
            {report && report.groups > 0 && !dryRun && (
              <button
                type="button"
                onClick={onMerge}
                disabled={mergeMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
              >
                <Merge className="h-4 w-4" />
                {mergeMutation.isPending ? "Merging…" : `Merge ${pendingCount} duplicate(s)`}
              </button>
            )}
          </div>
        </div>

        {mergeMutation.isPending && report && (
          <p className="mt-4 text-sm text-muted">Merging…</p>
        )}

        {!mergeMutation.isPending && report && (
          <div className="mt-4 space-y-3">
            {report.groups === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                No duplicate contacts found. Every phone number in this workspace has a single
                contact.
              </div>
            ) : (
              <>
                <div
                  className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm ${
                    dryRun ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                  }`}
                >
                  {dryRun ? (
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                  {dryRun
                    ? `Preview: ${report.groups} group(s), ${report.deleted} duplicate contact(s) found. Nothing was changed.`
                    : `Done: ${report.merged} group(s) merged, ${report.deleted} duplicate contact(s) deleted.`}
                </div>

                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {report.details.map((detail) => (
                    <li key={`${detail.workspace_id}-${detail.phone}`} className="flex items-center justify-between gap-2 bg-bg px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text">
                          {detail.kept_name || "(no name)"}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Copy className="h-3 w-3" />
                          {detail.phone}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-muted">
                        kept <span className="font-medium text-text">#{detail.kept}</span>
                        {detail.merged.length > 0 && (
                          <>
                            {" "}
                            · merged{" "}
                            <span className="font-medium text-text">
                              {detail.merged.map((id) => `#${id}`).join(", ")}
                            </span>
                          </>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>

                {dryRun && (
                  <p className="text-xs text-muted">
                    Review the groups above. The kept contact is chosen as a manually-saved or
                    earliest-created row; missing details are copied over from the duplicates.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DuplicateContactsSettingsPage() {
  return (
    <RequirePermission permission="contacts.delete">
      <DuplicateContactsManager />
    </RequirePermission>
  );
}
