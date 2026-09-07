"use client";

import Link from "next/link";
import {
  Bot,
  Building2,
  Clock,
  KeyRound,
  BellRing,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  Users2,
} from "lucide-react";
import { usePermission } from "@/hooks/use-permission";

interface SettingsLink {
  href: string;
  label: string;
  description: string;
  icon: typeof Settings;
  permission?: string;
}

const SETTINGS_LINKS: SettingsLink[] = [
  { href: "/settings/profile", label: "Profile", description: "Edit your name and email", icon: Palette },
  { href: "/settings/notifications", label: "Notifications", description: "Manage notification preferences", icon: BellRing },
  { href: "/settings/workspace", label: "Workspace", description: "Profile, branding, labels, saved replies & custom fields", icon: Building2 },
  { href: "/settings/operations", label: "Operations", description: "Business hours, away messages & SLA rules", icon: Clock, permission: "workspace.settings.manage" },
  { href: "/settings/users", label: "Users", description: "Manage team members and invitations", icon: Users, permission: "users.manage" },
  { href: "/settings/teams", label: "Teams", description: "Organize users into teams", icon: Users2, permission: "teams.view" },
  { href: "/settings/roles", label: "Roles & Permissions", description: "Configure access control", icon: KeyRound, permission: "roles.view" },
  { href: "/settings/whatsapp", label: "WhatsApp", description: "Connect, manage, and monitor session health", icon: Smartphone, permission: "whatsapp.connection.manage" },
  { href: "/settings/ai", label: "AI Assistant", description: "Configure AI-powered draft replies", icon: Bot, permission: "workspace.settings.manage" },
  { href: "/settings/audit-log", label: "Audit Log", description: "Review system activity", icon: ScrollText, permission: "audit_logs.view" },
  { href: "/settings/failed-jobs", label: "Failed Jobs", description: "Review failed background jobs", icon: ShieldCheck, permission: "dlq.manage" },
];

export default function SettingsRootPage() {
  const canManageUsers = usePermission("users.manage");
  const canManageWhatsapp = usePermission("whatsapp.connection.manage");
  const canViewContacts = usePermission("contacts.view");
  const canManageWorkspace = usePermission("workspace.settings.manage");
  const canViewTeams = usePermission("teams.view");
  const canViewRoles = usePermission("roles.view");
  const canViewAuditLog = usePermission("audit_logs.view");
  const canManageDlq = usePermission("dlq.manage");

  const permissionMap: Record<string, boolean> = {
    "users.manage": canManageUsers,
    "whatsapp.connection.manage": canManageWhatsapp,
    "contacts.view": canViewContacts,
    "workspace.settings.manage": canManageWorkspace,
    "teams.view": canViewTeams,
    "roles.view": canViewRoles,
    "audit_logs.view": canViewAuditLog,
    "dlq.manage": canManageDlq,
  };

  const visibleLinks = SETTINGS_LINKS.filter(
    (link) => !link.permission || permissionMap[link.permission]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="text-sm text-muted">
          Manage your workspace, team, and application preferences.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft/10"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg text-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{link.label}</p>
                <p className="mt-0.5 text-xs text-muted">{link.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
