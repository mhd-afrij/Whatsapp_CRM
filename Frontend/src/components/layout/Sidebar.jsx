import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { workspaceNav, managementNav, adminNav } from "../../config/navigation.js";
import { authFetch } from "../../store/index.js";

function NavSection({ title, items, badges }) {
  return (
    <div className="mb-6">
      <p className="px-3 mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <Link
              to={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <Icon size={16} strokeWidth={2} />
              <span>{label}</span>
              {badges?.[href] > 0 && (
                <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground min-w-[18px] text-center">
                  {badges[href] > 99 ? "99+" : badges[href]}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const conversationsQuery = useQuery({
    queryKey: ["conversations", { sidebar: true }],
    queryFn: () => authFetch("/conversations?per_page=100"),
    refetchInterval: 30000,
  });

  const badges = useMemo(() => {
    const items = conversationsQuery.data?.data ?? [];
    const total = items.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    return { "/inbox": total };
  }, [conversationsQuery.data]);

  return (
    <aside className="hidden md:flex md:flex-col w-[248px] shrink-0 border-r border-border-muted bg-sidebar h-screen sticky top-0 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-2 px-3 mb-6">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
          W
        </div>
        <span className="font-semibold text-text-primary text-[15px]">
          WhatsApp CRM
        </span>
      </div>
      <NavSection title="Workspace" items={workspaceNav} badges={badges} />
      <NavSection title="Management" items={managementNav} />
      <NavSection title="Administration" items={adminNav} />
    </aside>
  );
}
