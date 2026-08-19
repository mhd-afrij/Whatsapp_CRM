"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  Tag,
  UserPlus,
  ArrowUpDown,
  Flame,
  X,
  Kanban,
} from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { usePermission } from "@/hooks/use-permission";
import { useLeadList, useBulkAssignLeads, useBulkChangeStage, useBulkTagLeads } from "@/hooks/use-leads";
import { useUsers } from "@/hooks/use-users";
import { useLabelList } from "@/hooks/use-labels";
import type { LeadFilters, LeadStage, LeadSource, LeadTemperature } from "@/lib/leads-api";
import { STAGE_OPTIONS, ACTIVE_STAGES, TEMP_CONFIG, relativeTime } from "@/lib/leads-constants";
import { LabelBadge } from "@/components/labels/label-badge";
import { ErrorState } from "@/components/ui/error-state";
import { NewLeadModal } from "@/components/leads/new-lead-modal";

// ── Constants ──────────────────────────────────────────────────────────

const QUICK_FILTERS: { key: string; label: string; icon?: React.ReactNode }[] = [
  { key: "", label: "All" },
  { key: "my_leads", label: "My Leads" },
  { key: "new", label: "New" },
  { key: "hot", label: "Hot", icon: <Flame className="h-3 w-3 text-orange-500" /> },
  { key: "qualified", label: "Qualified" },
  { key: "followup_today", label: "Follow-up today" },
  { key: "overdue", label: "Overdue" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
];

function stageBadge(stage: LeadStage) {
  const opt = STAGE_OPTIONS.find((s) => s.value === stage);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${opt?.color ?? "bg-gray-100 text-gray-700"}`}>
      {opt?.label ?? stage}
    </span>
  );
}

function temperatureIcon(temp: LeadTemperature) {
  const config = TEMP_CONFIG[temp];
  if (!config) return null;
  if (temp === "hot") return <Flame className="h-3.5 w-3.5 text-orange-500" />;
  if (temp === "warm") return <span className="h-3.5 w-3.5 text-yellow-500">☀</span>;
  return <span className="h-3.5 w-3.5 text-blue-400">❄</span>;
}

// ── Skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-border/60" />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

function LeadsTable() {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [stage, setStage] = useState<LeadStage | "">("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [temperature, setTemperature] = useState<LeadTemperature | "">("");
  const [ownerFilter, setOwnerFilter] = useState<number | "">("");
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState<"assign" | "stage" | null>(null);

  const filters: LeadFilters = {
    search: search || undefined,
    quick_filter: quickFilter || undefined,
    stage: stage || undefined,
    source: source || undefined,
    temperature: temperature || undefined,
    owner_user_id: ownerFilter !== "" ? Number(ownerFilter) : undefined,
    labels: labelIds.length > 0 ? labelIds : undefined,
    page,
    per_page: 20,
  };

  const { data, isLoading, isError, refetch } = useLeadList(filters);
  const leads = data?.data ?? [];
  const meta = data?.meta;

  const { data: users } = useUsers();
  const { data: labels } = useLabelList();

  const bulkAssign = useBulkAssignLeads();
  const bulkStage = useBulkChangeStage();

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Leads</h1>
        <button
          type="button"
          onClick={() => setShowNewLead(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New lead
        </button>
      </div>

      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} />}

      {/* ── Quick filters ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((qf) => (
          <button
            key={qf.key}
            type="button"
            onClick={() => {
              setQuickFilter(qf.key);
              setPage(1);
            }}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              quickFilter === qf.key
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-muted hover:bg-primary-soft/30"
            }`}
          >
            {qf.icon}
            {qf.label}
          </button>
        ))}
      </div>

      {/* ── Search + filter row ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search leads by name, phone, email…"
            className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted hover:bg-primary-soft/30"
        >
          <Filter className="h-4 w-4" />
          Filters
          <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── Advanced filters ───────────────────────────────────── */}
      {showAdvanced && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Stage</label>
              <select
                value={stage}
                onChange={(e) => { setStage(e.target.value as LeadStage | ""); setPage(1); }}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
              >
                <option value="">All stages</option>
                {STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Temperature</label>
              <select
                value={temperature}
                onChange={(e) => { setTemperature(e.target.value as LeadTemperature | ""); setPage(1); }}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
              >
                <option value="">All</option>
                <option value="hot">🔥 Hot</option>
                <option value="warm">🟠 Warm</option>
                <option value="cold">🔵 Cold</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Source</label>
              <select
                value={source}
                onChange={(e) => { setSource(e.target.value as LeadSource | ""); setPage(1); }}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
              >
                <option value="">All sources</option>
                {["website", "whatsapp", "manual", "import", "referral", "phone", "email", "campaign", "other"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Owner</label>
              <select
                value={ownerFilter}
                onChange={(e) => { setOwnerFilter(e.target.value ? Number(e.target.value) : ""); setPage(1); }}
                className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text"
              >
                <option value="">All owners</option>
                {users?.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {labels && labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {labels.map((label: any) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => {
                    setLabelIds((prev) =>
                      prev.includes(label.id) ? prev.filter((id) => id !== label.id) : [...prev, label.id]
                    );
                    setPage(1);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    labelIds.includes(label.id)
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-muted hover:bg-primary-soft/30"
                  }`}
                >
                  {label.name}
                </button>
              ))}
            </div>
          )}

          {(stage || temperature || source || ownerFilter !== "" || labelIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setStage("");
                setTemperature("");
                setSource("");
                setOwnerFilter("");
                setLabelIds([]);
                setPage(1);
              }}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── Bulk actions bar ───────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBulkMode(bulkMode === "assign" ? null : "assign")}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-primary-soft/30"
            >
              <UserPlus className="h-3 w-3" /> Assign
            </button>
            <button
              type="button"
              onClick={() => setBulkMode(bulkMode === "stage" ? null : "stage")}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-primary-soft/30"
            >
              <ArrowUpDown className="h-3 w-3" /> Stage
            </button>
          </div>
          {bulkMode === "assign" && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  bulkAssign.mutate(
                    { leadIds: Array.from(selectedIds), owner_user_id: Number(e.target.value) },
                    { onSuccess: () => setSelectedIds(new Set()) }
                  );
                }
              }}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="">Select agent…</option>
              {users?.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          {bulkMode === "stage" && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  bulkStage.mutate(
                    { leadIds: Array.from(selectedIds), stage: e.target.value as LeadStage },
                    { onSuccess: () => setSelectedIds(new Set()) }
                  );
                }
              }}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="">Select stage…</option>
              {STAGE_OPTIONS.filter((s) => !["converted", "lost"].includes(s.value)).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-muted hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {isLoading && <TableSkeleton />}
        {isError && (
          <ErrorState message="Unable to load leads. Try again shortly." onRetry={() => refetch()} />
        )}
        {!isLoading && !isError && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-text">No leads yet</p>
            <p className="text-xs text-muted">
              Create one manually, or convert a contact or conversation into a lead.
            </p>
          </div>
        )}

        {!isLoading && !isError && leads.length > 0 && (
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === leads.length && leads.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Labels</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-primary-soft/30">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
                      {lead.contact?.full_name || `Contact #${lead.contact_id}`}
                    </Link>
                    {lead.contact?.phone_number && (
                      <p className="text-xs text-muted mt-0.5">{lead.contact.phone_number}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">{stageBadge(lead.stage)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {temperatureIcon(lead.temperature)}
                      <span className="font-medium text-text">{lead.score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{lead.source}</td>
                  <td className="px-4 py-3 text-muted">{lead.owner?.name || "Unassigned"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{relativeTime(lead.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.labels.map((label) => (
                        <LabelBadge key={label.id} label={label} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────── */}
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
    </div>
  );
}

export default function LeadsPage() {
  return (
    <RequirePermission permission="leads.manage">
      <LeadsTable />
    </RequirePermission>
  );
}
