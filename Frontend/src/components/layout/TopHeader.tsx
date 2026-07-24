import { Search, Bell, Plus, Wifi } from "lucide-react";
import { UserMenu } from "@/components/layout/UserMenu";

export function TopHeader() {
  return (
    <header className="h-16 border-b border-border-muted bg-background flex items-center justify-between px-4 gap-4 sticky top-0 z-10">
      <div className="flex items-center gap-2 text-sm text-text-secondary min-w-0">
        <span className="truncate">Workspace</span>
        <span className="text-text-muted">/</span>
        <span className="text-text-primary font-medium truncate">
          Dashboard
        </span>
      </div>

      <button
        type="button"
        className="hidden sm:flex flex-1 max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:border-border-muted"
      >
        <Search size={15} />
        <span>Search…</span>
        <kbd className="ml-auto text-xs rounded border border-border px-1.5 py-0.5 text-text-muted">
          Ctrl K
        </kbd>
      </button>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary">
          <Wifi size={13} className="text-primary" />
          <span className="hidden sm:inline">Connected</span>
        </div>
        <button
          type="button"
          aria-label="Quick create"
          className="rounded-md p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="rounded-md p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          <Bell size={18} />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
