"use client";

import { Loader2 } from "lucide-react";

export function SettingsSaveBar({
  dirty,
  saving,
  error,
  onSave,
  onReset,
  canSave = true,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
  canSave?: boolean;
}) {
  if (!dirty && !error) return null;
  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
      <p className="text-sm text-muted">
        {error ? <span className="font-medium text-danger">{error}</span> : "You have unsaved changes."}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving || !canSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
