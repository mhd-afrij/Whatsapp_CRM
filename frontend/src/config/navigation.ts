import type { LucideIcon } from "lucide-react";
import { BarChart3, Bell, BellRing, CalendarDays, ContactRound, FileBarChart, FileText, Inbox, LayoutDashboard, MessagesSquare, MessageSquareText, Phone, ScrollText, Settings, SlidersHorizontal, UserRound, Users, Webhook } from "lucide-react";

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
      { href: "/messages", label: "Messages", icon: MessagesSquare, permission: "conversations.view" },
      { href: "/templates", label: "Templates", icon: FileText, permission: "templates.manage" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.view" },
      { href: "/calendar", label: "Calendar & Appointments", icon: CalendarDays, permission: "tasks.manage" },
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
    label: "CRM",
    description: "Configure the data model and sales workflow.",
    icon: ContactRound,
    items: [
      { label: "Contact Settings", description: "Fields, identification, ownership, lifecycle and duplicates.", href: "/settings/workspace/contacts" },
      { label: "Lead Settings", description: "Pipelines, stages, assignment and sales automation.", href: "/settings/workspace/sales" },
    ],
  },
  {
    label: "Communication",
    description: "Inbox behavior, notifications, and templates.",
    icon: MessageSquareText,
    items: [
      { label: "Inbox Settings", description: "Assignment, routing, status, SLA and working hours.", href: "/settings/workspace/inbox" },
      { label: "Notifications", description: "Choose how and when you receive alerts.", href: "/settings/notifications" },
      { label: "Templates", description: "Quick replies and approved WhatsApp templates.", href: "/settings/workspace/templates" },
    ],
  },
  {
    label: "WhatsApp",
    description: "Accounts, message templates, and webhooks.",
    icon: Phone,
    items: [
      { label: "Accounts", description: "Connect numbers and manage connection health.", href: "/settings/whatsapp" },
      { label: "Message Templates", description: "Approved WhatsApp message templates.", href: "/settings/workspace/templates?tab=whatsapp" },
      { label: "Webhooks", description: "Monitor connectivity, events, logs and testing.", href: "/settings/workspace/whatsapp" },
    ],
  },
  {
    label: "System",
    description: "Analytics and audit history.",
    icon: SlidersHorizontal,
    items: [
      { label: "Analytics", description: "Reporting, attribution, metrics and retention.", href: "/settings/workspace/analytics" },
      { label: "Audit Logs", description: "Track actions by users and integrations.", href: "/settings/audit-log" },
    ],
  },
] as const;
