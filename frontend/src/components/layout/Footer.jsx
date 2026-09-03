import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Inbox, Users, Settings } from "lucide-react";

const mobileNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Team", href: "/team", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Footer() {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border-muted z-20">
      <div className="flex items-center justify-around py-2">
        {mobileNav.map(({ label, href, icon: Icon }) => {
          const isActive = location.pathname === href;
          return (
            <Link
              key={href}
              to={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium ${
                isActive ? "text-primary" : "text-text-muted"
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
