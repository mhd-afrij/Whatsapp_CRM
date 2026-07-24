"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function UserMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = user.name.charAt(0).toUpperCase();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary"
      >
        {initial}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 top-10 z-20 w-56 rounded-md border border-border bg-surface-raised p-1 shadow-lg">
            <div className="px-3 py-2 border-b border-border-muted mb-1">
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-xs text-text-muted truncate">{user.email}</p>
              <p className="text-xs text-text-muted mt-0.5">{user.workspace.name}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <LogOut size={15} />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
