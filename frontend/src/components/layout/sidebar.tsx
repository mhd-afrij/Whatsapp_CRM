"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronsUpDown, PanelLeftOpen, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar-context";
import { NAVIGATION_SECTIONS, type NavigationItem, type NavigationSection } from "@/config/navigation";

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const workspace = useWorkspaceSettings();
  const name = workspace.data?.name ?? "Current workspace";
  const logoUrl = workspace.data?.logo_url;
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={cn("relative border-b border-border p-3", collapsed && "px-2")}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} title={collapsed ? name : undefined} className={cn("flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/20", collapsed && "justify-center px-2")}>
        {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary">{initials || "WS"}</span>}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">Workspace</span><span className="block truncate text-sm font-semibold text-text">{name}</span></span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className={cn("absolute z-50 mt-2 w-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-xl", collapsed ? "left-12 top-1 w-56" : "left-3")}>
          <div className="border-b border-border px-2.5 py-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Current workspace</p><p className="truncate text-sm font-semibold text-text">{name}</p></div>
          <button type="button" disabled className="flex w-full cursor-not-allowed rounded-md px-2.5 py-2 text-left text-sm text-muted opacity-60">Switch workspace</button>
          <button type="button" disabled className="flex w-full cursor-not-allowed rounded-md px-2.5 py-2 text-left text-sm text-muted opacity-60">View all workspaces</button>
          <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted opacity-60"><Plus className="h-4 w-4" />Create new workspace</button>
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-2 text-sm font-medium text-text hover:bg-primary-soft/40">Manage workspaces</Link>
        </div>
      )}
    </div>
  );
}

function NavigationGroups({ pathname, collapsed, onNavigate }: { pathname: string; collapsed: boolean; onNavigate?: () => void }) {
  const canViewDashboard = usePermission("dashboard.view_workspace");
  const canViewInbox = usePermission("conversations.view");
  const canViewContacts = usePermission("contacts.view");
  const canManageLeads = usePermission("leads.manage");
  const canManageTasks = usePermission("tasks.manage");
  const canViewAnalytics = usePermission("analytics.view");
  const canViewCampaigns = usePermission("campaigns.view");
  const canManageWorkspace = usePermission("workspace.settings.manage");
  const canManageWhatsapp = usePermission("whatsapp.connection.manage");
  const permissions: Record<string, boolean> = {
    "dashboard.view_workspace": canViewDashboard,
    "conversations.view": canViewInbox,
    "contacts.view": canViewContacts,
    "leads.manage": canManageLeads,
    "tasks.manage": canManageTasks,
    "analytics.view": canViewAnalytics,
    "campaigns.view": canViewCampaigns,
    "workspace.settings.manage": canManageWorkspace,
    "whatsapp.connection.manage": canManageWhatsapp,
  };
  const sections = NAVIGATION_SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => !item.permission || permissions[item.permission]) })).filter((section) => section.items.length > 0);
  const allItems = sections.flatMap((section) => section.items);
  const activeHref = allItems.filter((item) => pathname === item.href || pathname.startsWith(item.href + "/")).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ main: true, automation: true, channels: true, administration: true });

  const renderItem = (item: NavigationItem) => {
    const active = activeHref === item.href;
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", collapsed && "justify-center px-2", active ? "bg-primary-soft text-primary-dark" : "text-muted hover:bg-primary-soft/50 hover:text-text")}><Icon className="h-4 w-4 shrink-0" />{!collapsed && <span className="flex-1 whitespace-nowrap">{item.label}</span>}</Link>;
  };

  const renderSection = (section: NavigationSection) => {
    const open = openSections[section.id];
    return <div key={section.id} className="space-y-1">
      {!collapsed && <button type="button" onClick={() => setOpenSections((current) => ({ ...current, [section.id]: !open }))} aria-expanded={open} aria-controls={"sidebar-section-" + section.id} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"><span>{section.label}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} /></button>}
      <div id={"sidebar-section-" + section.id} inert={!open} className={cn("grid transition-all duration-300 ease-in-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}><div className="overflow-hidden"><div className={cn("space-y-1", !collapsed && "pl-2")}>{section.items.map(renderItem)}</div></div></div>
    </div>;
  };

  return <nav className={cn("flex-1 space-y-2 overflow-y-auto px-3 py-4", collapsed && "px-2")}>{sections.map(renderSection)}</nav>;
}

function SidebarShell({ collapsed, onToggle, mobile = false, children }: { collapsed: boolean; onToggle?: () => void; mobile?: boolean; children: React.ReactNode }) {
  return <aside className={cn("relative flex h-full flex-col border-r border-border bg-surface", mobile ? "w-64 max-w-[80vw] shadow-lg" : "hidden shrink-0 overflow-hidden md:flex", !mobile && (collapsed ? "w-16" : "w-64"))}>
    <div className={cn("flex h-16 shrink-0 items-center border-b border-border", collapsed && !mobile ? "justify-center" : "gap-2 px-5")}><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />{(!collapsed || mobile) && <span className="text-base font-semibold text-text">CRM WhatsApp</span>}{mobile && onToggle && <button type="button" onClick={onToggle} aria-label="Close navigation menu" className="ml-auto rounded-md p-2 text-muted hover:bg-primary-soft/50 hover:text-text"><X className="h-5 w-5" /></button>}</div>
    <WorkspaceSwitcher collapsed={collapsed && !mobile} />
    {!mobile && collapsed && <button type="button" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar" className="mx-2 mt-2 flex items-center justify-center rounded-md p-2 text-muted transition-colors hover:bg-primary-soft/50 hover:text-text"><PanelLeftOpen className="h-4 w-4" /></button>}
    {children}
  </aside>;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close, collapsed, toggleCollapsed } = useMobileSidebar();
  return <>
    <SidebarShell collapsed={collapsed} onToggle={toggleCollapsed}><NavigationGroups pathname={pathname} collapsed={collapsed} /></SidebarShell>
    {isOpen && <div className="fixed inset-0 z-50 flex md:hidden"><button type="button" aria-label="Close navigation menu" onClick={close} className="absolute inset-0 bg-black/40 motion-reduce:transition-none" /><SidebarShell collapsed={false} mobile onToggle={close}><NavigationGroups pathname={pathname} collapsed={false} onNavigate={close} /></SidebarShell></div>}
  </>;
}