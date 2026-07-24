"use client";

import { useAuthStore } from "@/stores/auth-store";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SettingsPage() {
  const workspace = useAuthStore((state) => state.user?.workspace);

  return (
    <div>
      <PageHeader title="Settings" description="General workspace configuration." />

      <div className="max-w-lg space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-text-secondary">Workspace name</label>
          <input
            defaultValue={workspace?.name ?? ""}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
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
            defaultValue={workspace?.timezone ?? "UTC"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          disabled
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          Save changes (wired up in Phase 7)
        </button>
      </div>
    </div>
  );
}
