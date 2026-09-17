"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { WhatsappStatusIndicator } from "@/components/layout/whatsapp-status-indicator";
import { GlobalSearchBar } from "@/components/search/global-search-bar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Avatar } from "@/components/ui/avatar";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar-context";
import { cn } from "@/lib/utils";

function ProfileMenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-primary-soft/50",
        danger ? "text-danger" : "text-text"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function Topnav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { open, collapsed, toggleCollapsed } = useMobileSidebar();

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profileOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [profileOpen]);

  const go = (href: string) => {
    setProfileOpen(false);
    router.push(href);
  };

  if (pathname?.startsWith("/inbox")) {
    return null;
  }

  const iconButtonClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-primary-soft/50 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <header className="topnav-print-hide relative z-10 flex h-16 min-w-0 items-center gap-2 border-b border-border bg-surface px-6 shadow-topnav md:gap-4">
      <button
        type="button"
        onClick={open}
        aria-label="Open navigation menu"
        title="Open navigation menu"
        className={cn(iconButtonClass, "md:hidden")}
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(iconButtonClass, "hidden md:inline-flex")}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
      </button>

      <GlobalSearchBar />

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <WhatsappStatusIndicator />

        <NotificationBell />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          title="Toggle theme"
          className={iconButtonClass}
        >
          {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-label="Profile menu"
            title="Profile"
            className="flex cursor-pointer items-center gap-2.5 rounded-lg p-1 pr-1.5 hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Avatar name={user?.name ?? "?"} size="sm" className="h-9 w-9" />
            <span className="hidden text-left leading-tight lg:block">
              <span className="block text-sm font-medium text-text">{user?.name ?? "Unknown"}</span>
              <span className="hidden text-xs text-muted xl:block">{user?.email ?? ""}</span>
            </span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-surface py-1.5 shadow-pop">
              <ProfileMenuItem icon={User} label="Profile" onClick={() => go("/settings/profile")} />
              <ProfileMenuItem
                icon={Settings}
                label="Account Settings"
                onClick={() => go("/settings/profile")}
              />
              <ProfileMenuItem
                icon={Building2}
                label="Workspace"
                onClick={() => go("/settings/workspace")}
              />
              <div className="my-1 border-t border-border" />
              <ProfileMenuItem
                icon={LogOut}
                label="Logout"
                danger
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                }}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => logout()}
          aria-label="Logout"
          title="Logout"
          className={cn(iconButtonClass, "ml-2 hidden md:inline-flex hover:bg-danger/10 hover:text-danger")}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}