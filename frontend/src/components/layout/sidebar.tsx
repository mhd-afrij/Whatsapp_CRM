"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useInboxUnreadCount } from "@/hooks/use-inbox-unread-count";
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

  const canViewInbox = usePermission("conversations.view");
  const unreadCount = useInboxUnreadCount(canViewInbox);

  const [dashboardItem, inboxItem, ...restNavItems] = navItems;
  const orderedItems = [dashboardItem, inboxItem, ...leadingItems, ...restNavItems, ...otherGatedItems];

  const { isOpen, close } = useMobileSidebar();

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {orderedItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary-soft text-primary-dark"
                : "text-muted hover:bg-primary-soft/50 hover:text-text"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {href === "/inbox" && unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-base font-semibold text-text">CRM WhatsApp</span>
        </div>
        {renderNav()}
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
