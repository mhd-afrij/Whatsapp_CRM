import type { LucideIcon } from "lucide-react";
import { Building2, CalendarDays, ContactRound, FileBarChart, Inbox, LayoutDashboard, MessageSquareText, Phone, Settings, SlidersHorizontal, UserRound, Users } from "lucide-react";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
}

export interface NavigationSection {
  id: "main" | "channels" | "administration";
  label: string;
  items: NavigationItem[];
}

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view_workspace" },
      { href: "/inbox", label: "Inbox", icon: Inbox, permission: "conversations.view" },
      { href: "/contacts", label: "Contacts", icon: ContactRound, permission: "contacts.view" },
      { href: "/leads", label: "Leads", icon: Users, permission: "leads.manage" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, permission: "tasks.manage" },
      { href: "/reports", label: "Reports", icon: FileBarChart, permission: "analytics.view" },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    items: [
      { href: "/settings/whatsapp", label: "WhatsApp Accounts", icon: Phone, permission: "whatsapp.connection.manage" },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/profile", label: "Profile", icon: UserRound },
    ],
  },
];

export interface SettingsHubCard {
  label: string;
  description: string;
  href: string;
}

export interface SettingsHubCategory {
  label: string;
  description: string;
  icon: LucideIcon;
  items: SettingsHubCard[];
}

export const SETTINGS_HUB_CATEGORIES: SettingsHubCategory[] = [
  {
    label: "Workspace",
    description: "Identity, branding and workspace-wide behavior.",
    icon: Building2,
    items: [
      { label: "General", description: "Name, logo, category, country, timezone, language and away message.", href: "/settings/workspace/general" },
      { label: "Danger Zone", description: "Transfer ownership or disable the workspace.", href: "/settings/workspace/danger" },
    ],
  },
  {
    label: "CRM",
    description: "Configure the data model and sales workflow.",
    icon: ContactRound,
    items: [
      { label: "Contact Settings", description: "Fields, identification, ownership, lifecycle and duplicates.", href: "/settings/workspace/contacts" },
      { label: "Lead Settings", description: "Statuses, sources, assignment, scoring and conversion.", href: "/settings/workspace/leads" },
    ],
  },
  {
    label: "Communication",
    description: "Inbox behavior, notifications, and templates.",
    icon: MessageSquareText,
    items: [
      { label: "Inbox Settings", description: "Assignment, routing, status, SLA and working hours.", href: "/settings/workspace/inbox" },
      { label: "Operations", description: "Business hours, away message and SLA rules.", href: "/settings/operations" },
      { label: "Notifications", description: "Choose how and when you receive alerts.", href: "/settings/notifications" },
      { label: "Quick Reply Templates", description: "Reusable replies agents can insert from the chat composer.", href: "/settings/workspace/templates" },
    ],
  },
  {
    label: "WhatsApp",
    description: "Accounts and webhooks.",
    icon: Phone,
    items: [
      { label: "Accounts", description: "Connect numbers and manage connection health.", href: "/settings/whatsapp" },
      { label: "Webhooks", description: "Endpoint CRUD, event subscriptions, delivery testing.", href: "/settings/workspace/webhooks" },
    ],
  },
  {
    label: "System",
    description: "People, access, analytics and audit history.",
    icon: SlidersHorizontal,
    items: [
      { label: "Users & Permissions", description: "Manage workspace members and access.", href: "/settings/workspace/users" },
      { label: "Team Management", description: "Members, invitations and teams.", href: "/settings/workspace/team" },
      { label: "Roles", description: "Configure roles and permissions.", href: "/settings/workspace/roles" },
      { label: "Invitations", description: "Invite and manage pending workspace members.", href: "/settings/workspace/invites" },
      { label: "AI Assistant", description: "Provider, model and API key for AI draft replies.", href: "/settings/ai" },
      { label: "Analytics", description: "Tracking rules, retention, exports and access.", href: "/settings/workspace/analytics" },
      { label: "Audit Logs", description: "Track actions by users and integrations.", href: "/settings/audit-log" },
    ],
  },
] as const;
