"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Pencil, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/context/auth-context";
import {
  useArchiveContact,
  useContactList,
  useContactRealtime,
  useImportContacts,
  useRestoreContact,
} from "@/hooks/use-contacts";
import { downloadContactsExport, type ContactFilters, type ImportReport } from "@/lib/contacts-api";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { LabelFilterChips } from "@/components/labels/label-filter-chips";
import { LabelBadge } from "@/components/labels/label-badge";
import { ErrorState } from "@/components/ui/error-state";
import { ContactDetailDrawer } from "@/components/contacts/contact-detail-drawer";

type SortField = NonNullable<ContactFilters["sort"]>;

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "full_name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "created_at", label: "Date added" },
  { value: "last_contacted_at", label: "Last contact" },
];

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

function ImportReportPanel({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Import results</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-text">
          Dismiss
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-md bg-success/10 p-3">
          <p className="text-lg font-semibold text-success">{report.created.length}</p>
          <p className="text-xs text-muted">Created</p>
        </div>
        <div className="rounded-md bg-warning/10 p-3">
          <p className="text-lg font-semibold text-warning">{report.duplicates.length}</p>
          <p className="text-xs text-muted">Possible duplicates</p>
        </div>
        <div className="rounded-md bg-danger/10 p-3">
          <p className="text-lg font-semibold text-danger">{report.failed.length}</p>
          <p className="text-xs text-muted">Failed</p>
        </div>
      </div>

      {report.failed.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-text">Failed rows</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
            {report.failed.map((row, i) => (
              <li key={i}>
                Row {row.row}: {row.errors?.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.duplicates.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-text">Flagged duplicates (still created)</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
            {report.duplicates.map((row, i) => (
              <li key={i}>
                Row {row.row}: contact #{row.contact_id} duplicates existing contact #
                {row.duplicate_of_contact_id} (phone {row.phone_number})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const selectClass =
  "rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary";

function ContactsTable() {
  const canCreate = usePermission("contacts.create");
  const canEdit = usePermission("contacts.edit");
  const canExport = usePermission("contacts.export");
  const canDelete = usePermission("contacts.delete");
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortField>("created_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [archived, setArchived] = useState(false);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filters: ContactFilters = {
    search: search || undefined,
    sort,
    direction,
    page,
    per_page: 20,
    labels: labelIds.length > 0 ? labelIds : undefined,
    archived: archived || undefined,
    status: (status as ContactFilters["status"]) || undefined,
    source: source || undefined,
    whatsapp: (whatsapp as ContactFilters["whatsapp"]) || undefined,
  };
  const { data, isLoading, isError, refetch } = useContactList(filters);
  const importMutation = useImportContacts();
  const archiveMutation = useArchiveContact();
  const restoreMutation = useRestoreContact();

  // Refresh on realtime contact.created/updated/deleted events (spec §17).
  useContactRealtime();

  const contacts = data?.data ?? [];
  const meta = data?.meta;

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection("asc");
    }
    setPage(1);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const report = await importMutation.mutateAsync(file);
      setImportReport(report);
    } catch (error) {
      setImportError(error instanceof ApiError ? error.message : "Import failed. Please try again.");
    }
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      await downloadContactsExport();
    } catch (error) {
      setExportError(error instanceof ApiError ? error.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (contactId: number) => {
    if (!window.confirm("Delete this contact? It will be moved to Archived and can be restored later.")) return;
    setActionError(null);
    try {
      await archiveMutation.mutateAsync(contactId);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Unable to delete contact.");
    }
  };

  const handleRestore = async (contactId: number) => {
    setActionError(null);
    try {
      await restoreMutation.mutateAsync(contactId);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Unable to restore contact.");
    }
  };

  const onFilterChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Contacts</h1>
        <div className="flex flex-wrap items-center gap-2">
          {!archived && canCreate && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={handleImportClick}
                disabled={importMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-primary-soft/40 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {importMutation.isPending ? "Importing…" : "Import CSV"}
              </button>
            </>
          )}
          {!archived && canExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-primary-soft/40 disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          )}
          {!archived && canCreate && (
            <Link
              href="/contacts/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              New contact
            </Link>
          )}
        </div>
      </div>

      {importError && <p className="text-sm text-danger">{importError}</p>}
      {exportError && <p className="text-sm text-danger">{exportError}</p>}
      {actionError && <p className="text-sm text-danger">{actionError}</p>}
      {importReport && <ImportReportPanel report={importReport} onClose={() => setImportReport(null)} />}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, email, phone, company…"
          className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => {
              setArchived(false);
              setPage(1);
            }}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              !archived ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => {
              setArchived(true);
              setPage(1);
            }}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              archived ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
            )}
          >
            Archived
          </button>
        </div>

        {!archived && (
          <>
            <select value={status} onChange={onFilterChange(setStatus)} className={selectClass} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select value={source} onChange={onFilterChange(setSource)} className={selectClass} aria-label="Filter by source">
              <option value="">All sources</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="manual">Manual</option>
              <option value="import">Import</option>
            </select>

            <select value={whatsapp} onChange={onFilterChange(setWhatsapp)} className={selectClass} aria-label="Filter by WhatsApp status">
              <option value="">Any WhatsApp</option>
              <option value="connected">WhatsApp connected</option>
              <option value="unavailable">WhatsApp unavailable</option>
            </select>
          </>
        )}
      </div>

      <LabelFilterChips
        selected={labelIds}
        onChange={(ids) => {
          setLabelIds(ids);
          setPage(1);
        }}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {isLoading && <TableSkeleton />}

        {isError && (
          <ErrorState message="Unable to load contacts. Try again shortly." onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-text">
              {archived ? "No archived contacts" : "No contacts yet"}
            </p>
            <p className="text-xs text-muted">
              {search
                ? "No matches for your search."
                : archived
                  ? "Archived contacts appear here and can be restored."
                  : "Create or import a contact to get started."}
            </p>
          </div>
        )}

        {!isLoading && !isError && contacts.length > 0 && (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                {SORT_OPTIONS.map((opt) => (
                  <th key={opt.value} className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(opt.value)}
                      className={cn(
                        "hover:text-text",
                        sort === opt.value && "font-semibold text-text"
                      )}
                    >
                      {opt.label} {sort === opt.value ? (direction === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Labels</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-border last:border-0 hover:bg-primary-soft/30">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setSelectedContactId(contact.id)} className="font-medium text-primary hover:underline">
                      {contact.full_name || "(no name)"}
                    </button>
                    {contact.deleted_at && (
                      <span className="ml-2 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-muted">
                        Archived {new Date(contact.deleted_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{contact.email || "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {contact.last_contacted_at ? new Date(contact.last_contacted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{contact.phone_number || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs capitalize",
                        contact.status === "inactive" ? "text-muted" : "text-success"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          contact.status === "inactive" ? "bg-muted" : "bg-success"
                        )}
                      />
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {contact.labels.map((label) => (
                        <LabelBadge key={label.id} label={label} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.deleted_at ? (
                      canDelete && (
                        <button
                          type="button"
                          onClick={() => handleRestore(contact.id)}
                          disabled={restoreMutation.isPending}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      )
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {(canEdit ||
                          (canCreate &&
                            contact.owner_user_id != null &&
                            Number(user?.id) === contact.owner_user_id)) && (
                          <Link
                            href={`/contacts/${contact.id}?edit=1`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-primary-soft/40"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(contact.id)}
                            disabled={archiveMutation.isPending}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {meta && meta.last_page && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {meta.page} of {meta.last_page} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!!meta.last_page && page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ContactDetailDrawer
        contactId={selectedContactId}
        open={selectedContactId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedContactId(null);
        }}
      />
    </div>
  );
}

export default function ContactsPage() {
  return (
    <RequirePermission permission="contacts.view">
      <ContactsTable />
    </RequirePermission>
  );
}
