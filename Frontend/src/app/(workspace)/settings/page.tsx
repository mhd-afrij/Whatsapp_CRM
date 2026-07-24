"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore, authFetch } from "@/stores/auth-store";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Workspace } from "@/types/auth";

export default function SettingsPage() {
  const workspace = useAuthStore((state) => state.user?.workspace);
  const canManage = useAuthStore((state) => state.hasPermission("settings.general.manage"));
  const [name, setName] = useState(workspace?.name ?? "");
  const [timezone, setTimezone] = useState(workspace?.timezone ?? "UTC");
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => authFetch<Workspace>("/workspace", { method: "PATCH", body: { name, timezone } }),
    onSuccess: (updated) => {
      const user = useAuthStore.getState().user;
      if (user) {
        useAuthStore.setState({ user: { ...user, workspace: { ...user.workspace, ...updated } } });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div>
      <PageHeader title="Settings" description="General workspace configuration." />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="max-w-lg space-y-4"
      >
        <div className="space-y-1.5">
          <label className="text-sm text-text-secondary">Workspace name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-text-secondary">Workspace slug</label>
          <input
            defaultValue={workspace?.slug ?? ""}
            disabled
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-muted outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-text-secondary">Timezone</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!canManage}
            placeholder="e.g. America/New_York"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </div>

        {saveMutation.isError && (
          <p className="text-xs text-danger">Couldn&apos;t save changes. Check the timezone value and try again.</p>
        )}
        {saved && <p className="text-xs text-success">Saved.</p>}

        <button
          type="submit"
          disabled={!canManage || saveMutation.isPending}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
        {!canManage && (
          <p className="text-xs text-text-muted">You need the settings.general.manage permission to make changes.</p>
        )}
      </form>
    </div>
  );
}
