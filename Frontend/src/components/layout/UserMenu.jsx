import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "../../store/index.js";

export function UserMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  if (!user) return null;

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 rounded-md p-1.5 hover:bg-surface-hover">
        <div className="h-7 w-7 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-primary">
          {user.name.charAt(0)}
        </div>
      </button>
      <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border border-border bg-surface-raised shadow-lg py-1 hidden group-hover:block">
        <div className="px-3 py-2 border-b border-border-muted">
          <p className="text-sm font-medium text-text-primary">{user.name}</p>
          <p className="text-xs text-text-muted">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}
