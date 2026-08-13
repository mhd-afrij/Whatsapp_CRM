"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Kanban,
  CheckSquare,
  CalendarDays,
  Tag,
  BellRing,
  Users2,
  KeyRound,
  Building2,
  ScrollText,
  Zap,
  Clock,
  AlertTriangle,
  Wifi,
  ChevronDown,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar-context";
import { X } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
  // Not permission-gated (unlike the items below) - every authenticated user manages
  // their own notification preferences regardless of role.
  { href: "/settings/notifications", label: "Notifications", icon: BellRing },
];

// Nav items gated on a permission beyond plain authentication. Kept separate
// from `navItems` so adding another admin-only entry doesn't require
// threading permission checks through the generic list.
const permissionGatedNavItems = [
  {
    href: "/contacts",
    label: "Contacts",
    icon: Users,
    permission: "contacts.view",
  },
  {
    href: "/leads",
    label: "Leads",
    icon: UserPlus,
    permission: "leads.manage",
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: Kanban,
    permission: "deals.manage",
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CheckSquare,
    permission: "tasks.manage",
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    permission: "tasks.manage",
  },
  {
    href: "/settings/users",
    label: "User Management",
    icon: ShieldCheck,
    permission: "users.manage",
  },
  {
    href: "/settings/teams",
    label: "Teams",
    icon: Users2,
    permission: "teams.view",
  },
  {
    href: "/settings/roles",
    label: "Roles & Permissions",
    icon: KeyRound,
    permission: "roles.view",
  },
  {
    href: "/settings/whatsapp",
    label: "WhatsApp Connection",
    icon: Smartphone,
    permission: "whatsapp.connection.manage",
  },
  {
    href: "/settings/pipelines",
    label: "Pipeline Settings",
    icon: Kanban,
    permission: "pipelines.manage",
  },
  {
    href: "/settings/labels",
    label: "Labels",
    icon: Tag,
    permission: "labels.manage",
  },
  {
    href: "/settings/templates",
    label: "Saved Replies",
    icon: Zap,
    permission: "templates.use",
  },
  {
    href: "/settings/sla",
    label: "SLA Configuration",
    icon: Clock,
    permission: "workspace.settings.manage",
  },
  {
    href: "/settings/business-hours",
    label: "Business Hours",
    icon: Clock,
    permission: "workspace.settings.manage",
  },
  {
    href: "/settings/away-message",
    label: "Away Message",
    icon: MessageSquare,
    permission: "workspace.settings.manage",
  },
  {
    href: "/settings/workspace",
    label: "Workspace Settings",
    icon: Building2,
    permission: "workspace.settings.manage",
  },
  {
    href: "/settings/audit-log",
    label: "Audit Log",
    icon: ScrollText,
    permission: "audit_logs.view",
  },
  {
    href: "/settings/failed-jobs",
    label: "Failed Jobs",
    icon: AlertTriangle,
    permission: "dlq.manage",
  },
  {
    href: "/settings/whatsapp-health",
    label: "WhatsApp Health",
    icon: Wifi,
    permission: "whatsapp.connection.manage",
  },
  {
    href: "/settings/custom-fields",
    label: "Custom Fields",
    icon: Settings,
    permission: "workspace.settings.manage",
  },
];

// Category membership for grouping visible modules under section headers.
const categoryHrefs: Record<string, string[]> = {
  workspace: [
    "/dashboard",
    "/inbox",
    "/contacts",
    "/leads",
    "/pipeline",
    "/tasks",
    "/calendar",
    "/settings/notifications",
  ],
  management: ["/settings/users", "/settings/teams", "/settings/roles"],
  administration: [
    "/settings",
    "/settings/whatsapp",
    "/settings/pipelines",
    "/settings/labels",
    "/settings/templates",
    "/settings/sla",
    "/settings/business-hours",
    "/settings/away-message",
    "/settings/workspace",
    "/settings/audit-log",
    "/settings/failed-jobs",
    "/settings/whatsapp-health",
    "/settings/custom-fields",
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const canManageUsers = usePermission("users.manage");
  const canManageWhatsapp = usePermission("whatsapp.connection.manage");
  const canViewContacts = usePermission("contacts.view");
  const canManageLeads = usePermission("leads.manage");
  const canManageDeals = usePermission("deals.manage");
  const canManagePipelines = usePermission("pipelines.manage");
  const canManageTasks = usePermission("tasks.manage");
  const canManageLabels = usePermission("labels.manage");
  const canUseTemplates = usePermission("templates.use");
  const canManageWorkspace = usePermission("workspace.settings.manage");
  const canViewTeams = usePermission("teams.view");
  const canViewRoles = usePermission("roles.view");
  const canViewAuditLog = usePermission("audit_logs.view");
  const canManageDlq = usePermission("dlq.manage");
  const permissionByHref: Record<string, boolean> = {
    "/contacts": canViewContacts,
    "/leads": canManageLeads,
    "/pipeline": canManageDeals,
    "/tasks": canManageTasks,
    "/calendar": canManageTasks,
    "/settings/users": canManageUsers,
    "/settings/teams": canViewTeams,
    "/settings/roles": canViewRoles,
    "/settings/whatsapp": canManageWhatsapp,
    "/settings/pipelines": canManagePipelines,
    "/settings/labels": canManageLabels,
    "/settings/templates": canUseTemplates,
    "/settings/sla": canManageWorkspace,
    "/settings/workspace": canManageWorkspace,
    "/settings/audit-log": canViewAuditLog,
    "/settings/failed-jobs": canManageDlq,
    "/settings/whatsapp-health": canManageWhatsapp,
    "/settings/custom-fields": canManageWorkspace,
  };

  const leadingHrefs = ["/contacts", "/leads", "/pipeline", "/tasks", "/calendar"];
  const visibleGatedItems = permissionGatedNavItems.filter(
    (item) => permissionByHref[item.href]
  );
  const leadingItems = visibleGatedItems.filter((item) => leadingHrefs.includes(item.href));
  const otherGatedItems = visibleGatedItems.filter((item) => !leadingHrefs.includes(item.href));

  const [dashboardItem, inboxItem, ...restNavItems] = navItems;
  const orderedItems = [dashboardItem, inboxItem, ...leadingItems, ...restNavItems, ...otherGatedItems];

  const { isOpen, close, collapsed, toggleCollapsed } = useMobileSidebar();

  // Sidebar structure: independently collapsible categories grouping modules
  // by area.
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    workspace: true,
    management: false,
    administration: false,
  });
  const toggleCategory = (key: string) =>
    setOpenCategories((prev) => ({ ...prev, [key]: !prev[key] }));

  // Auto-expand the category containing the active route when navigating
  // (covers deep links). Adjusted during render, per React's recommended
  // "adjusting state when a prop changes" pattern — no effect needed.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenCategories((prev) => {
      const next = { ...prev };
      for (const [key, hrefs] of Object.entries(categoryHrefs)) {
        if (hrefs.some((href) => pathname === href || pathname?.startsWith(`${href}/`))) {
          next[key] = true;
        }
      }
      return next;
    });
  }

  const renderNav = (onNavigate?: () => void) => {
    const renderItem = (item: (typeof orderedItems)[number]) => {
      const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary-soft text-primary-dark"
              : "text-muted hover:bg-primary-soft/50 hover:text-text"
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1 whitespace-nowrap">{item.label}</span>
        </Link>
      );
    };

    const renderCategory = (
      key: string,
      label: string,
      items: (typeof orderedItems)[number][]
    ) => {
      const open = openCategories[key];
      return (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => toggleCategory(key)}
            aria-expanded={open}
            aria-controls={`sidebar-category-${key}`}
            className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"
          >
            <span className="flex items-center gap-2">
              {label}
              <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-dark">
                {items.length}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>
          <div
            id={`sidebar-category-${key}`}
            inert={!open}
            className={cn(
              "grid transition-all duration-300 ease-in-out motion-reduce:transition-none",
              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-1 pl-2">{items.map(renderItem)}</div>
            </div>
          </div>
        </div>
      );
    };

    const itemByHref = new Map(orderedItems.map((item) => [item.href, item]));
    const pick = (hrefs: string[]) =>
      hrefs
        .map((href) => itemByHref.get(href))
        .filter((item): item is (typeof orderedItems)[number] => Boolean(item));

    const workspaceItems = pick(categoryHrefs.workspace);
    const managementItems = pick(categoryHrefs.management);
    const administrationItems = pick(categoryHrefs.administration);

    return (
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {workspaceItems.length > 0 && renderCategory("workspace", "Workspace", workspaceItems)}
        {managementItems.length > 0 && renderCategory("management", "Management", managementItems)}
        {administrationItems.length > 0 &&
          renderCategory("administration", "Administration", administrationItems)}
      </nav>
    );
  };

  return (
    <>
      {/* Desktop sidebar — collapses to an icon rail with a width transition */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col overflow-hidden border-r border-border bg-surface md:flex transition-[width] duration-300 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-border",
            collapsed ? "justify-center" : "gap-2 px-6"
          )}
        >
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          {!collapsed && <span className="text-base font-semibold text-text">CRM WhatsApp</span>}
        </div>
        {collapsed ? (
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex w-full items-center justify-center rounded-md p-2 text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            {orderedItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-soft text-primary-dark"
                      : "text-muted hover:bg-primary-soft/50 hover:text-text"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </Link>
              );
            })}
          </nav>
        ) : (
          renderNav()
        )}
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            className="absolute inset-0 bg-black/40 motion-reduce:transition-none"
          />
          <aside className="relative flex h-full w-64 max-w-[80vw] flex-col border-r border-border bg-surface shadow-lg">
            <div className="flex h-16 items-center justify-between gap-2 border-b border-border px-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                <span className="text-base font-semibold text-text">CRM WhatsApp</span>
              </div>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={close}
                className="rounded-md p-2 text-muted hover:bg-primary-soft/50 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNav(close)}
          </aside>
        </div>
      )}
    </>
  );
}
