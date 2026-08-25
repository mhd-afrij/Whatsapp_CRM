"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCreateLabel, useDeleteLabel, useLabelList, useUpdateLabel } from "@/hooks/use-labels";
import { ApiError } from "@/lib/api-client";
import type { LabelSummary } from "@/lib/conversations-api";
import { ErrorState } from "@/components/ui/error-state";

const SWATCHES = [
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#6B7280",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Choose ${hex}`}
          onClick={() => onChange(hex)}
          className={`h-6 w-6 rounded-full border-2 ${value === hex ? "border-text" : "border-transparent"}`}
          style={{ backgroundColor: hex }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
        aria-label="Custom color"
      />
    </div>
  );
}

function LabelRow({ label }: { label: LabelSummary }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color_hex || "#6366F1");
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateLabel();
  const deleteMutation = useDeleteLabel();

  const onSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: label.id, values: { name: name.trim(), color_hex: color } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update label.");
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${label.name}"? It will be removed from every contact, deal, and conversation it's attached to.`)) {
      return;
    }
    setError(null);
    try {
      await deleteMutation.mutateAsync(label.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete label.");
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-bg px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      {editing ? (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
          />
          <ColorPicker value={color} onChange={setColor} />
          <button
            type="button"
            onClick={onSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(label.name);
              setColor(label.color_hex || "#6366F1");
            }}
            className="text-xs text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: label.color_hex || "#6366F1" }}
          />
          <span className="text-sm font-medium text-text">{label.name}</span>
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        disabled={deleteMutation.isPending}
        aria-label={`Delete ${label.name}`}
        className="shrink-0 rounded-md p-1.5 text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </li>
  );
}

function LabelsManager() {
  const { data: labels, isLoading, isError, refetch } = useLabelList();
  const createMutation = useCreateLabel();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCHES[0]);
  const [createError, setCreateError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      await createMutation.mutateAsync({ name: newName.trim(), color_hex: newColor });
      setNewName("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Unable to create label.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Labels</h1>
        <p className="mt-1 text-sm text-muted">
          Create, recolor, and remove workspace labels. Labels can be attached to contacts,
          deals, and conversations to segment and filter them. Deleting a label here
          removes it from every record it&apos;s attached to.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">New label</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Label name"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted"
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button
            type="button"
            onClick={onCreate}
            disabled={createMutation.isPending || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
        {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Workspace labels</h2>
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {isError && (
          <ErrorState message="Unable to load labels." onRetry={() => refetch()} />
        )}
        {!isLoading && !isError && (labels?.length ?? 0) === 0 && (
          <p className="text-sm text-muted">No labels yet. Create one above.</p>
        )}
        {!isLoading && !isError && labels && labels.length > 0 && (
          <ul className="space-y-2">
            {labels.map((label) => (
              <LabelRow key={label.id} label={label} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function LabelsSettingsPage() {
  return (
    <RequirePermission permission="labels.manage">
      <LabelsManager />
    </RequirePermission>
  );
}
