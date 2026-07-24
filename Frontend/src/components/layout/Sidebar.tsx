import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  Users,
  Kanban,
  CheckSquare,
  Calendar,
  BarChart3,
  Megaphone,
  WandSparkles,
  FileText,
  UsersRound,
  Settings,
  MessageCircle,
} from "lucide-react";

const workspaceNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Leads", href: "/leads", icon: Kanban },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Campaigns", href: "/search", icon: Megaphone },
  { label: "Automation", href: "/notifications", icon: WandSparkles },
  { label: "Reports", href: "/audit-log", icon: FileText },
  { label: "Team", href: "/team", icon: UsersRound },
  { label: "WhatsApp Accounts", href: "/settings/whatsapp", icon: MessageCircle },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavSection({
  title,
  items,
}: {
  title: string;
  items: typeof workspaceNav;
}) {
  return (
    <div className="mb-5">
      <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <Link
              to={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.25 text-[13px] font-medium text-white/72 transition-colors hover:bg-white/6 hover:text-white"
            >
              <Icon size={15} strokeWidth={2} />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-[248px] shrink-0 border-r border-white/8 bg-[#091017] h-screen sticky top-0 overflow-y-auto px-3 py-3.5 text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25d366] text-sm font-black text-[#06120a] shadow-[0_0_0_4px_rgba(37,211,102,0.12)]">
            W
          </div>
          <span className="font-semibold text-[15px] tracking-[-0.02em]">
            WA CRM
          </span>
        </div>
        <button type="button" className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white">
          <Settings size={16} />
        </button>
      </div>
      <div className="mt-2.5 px-3">
        <NavSection title="Main Menu" items={workspaceNav} />
      </div>
      <div className="mt-auto px-3 pb-2">
        <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#2ecf6e] to-[#167a3f] font-semibold text-white">
              AJ
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">Alex Johnson</p>
              <p className="text-xs text-white/45">Admin</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
