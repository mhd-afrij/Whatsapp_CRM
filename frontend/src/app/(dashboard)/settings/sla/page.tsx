"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import {
  useCreateSlaConfig,
  useDeleteSlaConfig,
  useSlaConfigs,
  useUpdateSlaConfig,
} from "@/hooks/use-sla";
import { ApiError } from "@/lib/api-client";
import type { SlaConfig } from "@/lib/sla-api";
import { ErrorState } from "@/components/ui/error-state";

function SlaConfigRow({
  config,
  onEdit,
}: {
  config: SlaConfig;
  onEdit: (config: SlaConfig) => void;
}) {
  const deleteMutation = useDeleteSlaConfig();
  const updateMutation = useUpdateSlaConfig();

  const onDelete = async () => {
    if (!window.confirm(`Delete "${config.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(config.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to delete SLA config.");
    }
  };

  const toggleActive = async () => {
    try {
      await updateMutation.mutateAsync({
        id: config.id,
        values: { is_active: !config.is_active },
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Unable to update SLA config.");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">{config.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            First response: {config.first_response_minutes}min | Follow-up: {config.followup_response_minutes}min
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleActive}
          disabled={updateMutation.isPending}
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            config.is_active
              ? "bg-success/10 text-success"
              : "bg-bg text-muted"
          } hover:opacity-80 disabled:opacity-50`}
        >
          {config.is_active ? "Active" : "Inactive"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(config)}
          className="rounded-md p-1.5 text-muted hover:bg-bg hover:text-text"
          aria-label={`Edit ${config.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteMutation.isPending}
          aria-label={`Delete ${config.name}`}
          className="rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function SlaConfigForm({
  initial,
  onClose,
}: {
  initial?: SlaConfig;
  onClose: () => void;
}) {
  const createMutation = useCreateSlaConfig();
  const updateMutation = useUpdateSlaConfig();
  const [name, setName] = useState(initial?.name ?? "");
  const [firstResponse, setFirstResponse] = useState(initial?.first_response_minutes ?? 60);
  const [followupResponse, setFollowupResponse] = useState(initial?.followup_response_minutes ?? 240);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initial);
  const mutation = isEditing ? updateMutation : createMutation;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: initial!.id,
          values: {
            name: name.trim(),
            first_response_minutes: firstResponse,
            followup_response_minutes: followupResponse,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          first_response_minutes: firstResponse,
          followup_response_minutes: followupResponse,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save SLA config.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text">
        {isEditing ? "Edit SLA config" : "New SLA config"}
      </h3>

      <div>
        <label htmlFor="sla-name" className="mb-1 block text-xs font-medium text-muted">
          Name *
        </label>
        <input
          id="sla-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Default SLA"
          required
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sla-first" className="mb-1 block text-xs font-medium text-muted">
            First Response (minutes) *
          </label>
          <input
            id="sla-first"
            type="number"
            value={firstResponse}
            onChange={(e) => setFirstResponse(parseInt(e.target.value) || 60)}
            min={1}
            required
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label htmlFor="sla-followup" className="mb-1 block text-xs font-medium text-muted">
            Follow-up Response (minutes) *
          </label>
          <input
            id="sla-followup"
            type="number"
            value={followupResponse}
            onChange={(e) => setFollowupResponse(parseInt(e.target.value) || 240)}
            min={1}
            required
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={mutation.isPending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm text-muted hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SlaManager() {
  const { data: configs, isLoading, isError, refetch } = useSlaConfigs();
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SlaConfig | null>(null);

  const handleEdit = (config: SlaConfig) => {
    setEditingConfig(config);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingConfig(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">SLA Configuration</h1>
        <p className="mt-1 text-sm text-muted">
          Set response time goals for your team. SLAs track first response and follow-up times
          to ensure timely customer communication.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setEditingConfig(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New SLA
        </button>
      </div>

      {showForm && (
        <SlaConfigForm initial={editingConfig ?? undefined} onClose={handleCloseForm} />
      )}

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">SLA Configurations</h2>
        {isLoading && <p className="text-sm text-muted">Loading...</p>}
        {isError && (
          <ErrorState message="Unable to load SLA configs." onRetry={() => refetch()} />
        )}
        {!isLoading && !isError && (configs?.length ?? 0) === 0 && (
          <div className="py-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted/50" />
            <p className="mt-2 text-sm text-muted">No SLA configurations yet.</p>
            <p className="text-xs text-muted">Create your first SLA above.</p>
          </div>
        )}
        {!isLoading && !isError && configs && configs.length > 0 && (
          <ul className="space-y-2">
            {configs.map((config) => (
              <SlaConfigRow
                key={config.id}
                config={config}
                onEdit={handleEdit}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function SlaSettingsPage() {
  return (
    <RequirePermission permission="workspace.settings.manage">
      <SlaManager />
    </RequirePermission>
  );
}
