"use client";

import { LogOut, Menu, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useSocket } from "@/providers/socket-provider";
import { WhatsappStatusIndicator } from "@/components/layout/whatsapp-status-indicator";
import { GlobalSearchBar } from "@/components/search/global-search-bar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar-context";

export function Topnav() {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const { open } = useMobileSidebar();

  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:gap-3 sm:px-4 lg:gap-4 lg:px-6">
      <button
        type="button"
        onClick={open}
        aria-label="Open navigation menu"
        className="shrink-0 rounded-md p-2 text-muted hover:bg-primary-soft/50 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden shrink-0 items-center gap-2 text-sm text-muted lg:flex">
        {isConnected ? (
          <Wifi className="h-4 w-4 text-success" />
        ) : (
          <WifiOff className="h-4 w-4 text-muted" />
        )}
        <span>{isConnected ? "Live" : "Offline"}</span>
      </div>

      <GlobalSearchBar />

      <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
        <WhatsappStatusIndicator />

        <NotificationBell />

        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="hidden text-sm sm:block">
            <p className="font-medium text-text">{user?.name ?? "Unknown"}</p>
            <p className="hidden text-xs text-muted xl:block">{user?.email ?? ""}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-danger/10 hover:text-danger"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
