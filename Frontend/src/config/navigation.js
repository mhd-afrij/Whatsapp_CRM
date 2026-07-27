import {
  LayoutDashboard,
  Inbox,
  Users,
  Kanban,
  CheckSquare,
  Calendar,
  Search,
  BarChart3,
  UsersRound,
  ScrollText,
  Bell,
  Radio,
  ShieldCheck,
  Settings,
} from "lucide-react";

export const workspaceNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Leads", href: "/leads", icon: Kanban },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Search", href: "/search", icon: Search },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

export const managementNav = [
  { label: "Team", href: "/team", icon: UsersRound },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
];

export const adminNav = [
  { label: "WhatsApp Connection", href: "/settings/whatsapp", icon: Radio },
  { label: "Roles & Permissions", href: "/settings/roles", icon: ShieldCheck },
  { label: "Settings", href: "/settings", icon: Settings },
];
