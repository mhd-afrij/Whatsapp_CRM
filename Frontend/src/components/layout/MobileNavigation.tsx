import { Link } from "react-router-dom";
import { Home, Inbox, Kanban, CheckSquare, MoreHorizontal } from "lucide-react";

const items = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Leads", href: "/leads", icon: Kanban },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "More", href: "/more", icon: MoreHorizontal },
];

export function MobileNavigation() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border-muted bg-sidebar h-16 flex items-stretch">
      {items.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          to={href}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-text-secondary text-[11px] min-h-11"
        >
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
