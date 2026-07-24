import { ChevronDown, Search, Bell, Plus, Wifi } from "lucide-react";

export function TopHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between gap-4 border-b border-white/8 bg-[#0c1218] px-5 text-white shadow-[0_1px_0_rgba(255,255,255,0.03)]">
      <div className="hidden lg:flex flex-1 max-w-xl items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-2.5 text-sm text-white/42">
        <Search size={15} />
        <span className="truncate">Search contacts, conversations...</span>
        <kbd className="ml-auto rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/55">
          Ctrl + K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs text-white/70">
          <Wifi size={13} className="text-[#25d366]" />
          <span>WhatsApp Connected</span>
        </div>
        <button
          type="button"
          aria-label="Quick create"
          className="rounded-full p-2 text-white/60 hover:bg-white/6 hover:text-white"
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-full p-2 text-white/60 hover:bg-white/6 hover:text-white"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-[#0c1218] bg-[#ff5f57]" />
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-2 py-1.5 pr-3 text-left text-white/85 hover:bg-white/7"
          aria-label="Account menu"
        >
          <div className="h-9 w-9 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-[#2ecf6e] to-[#167a3f]">
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.42),transparent_28%)]" />
          </div>
          <div className="hidden xl:block leading-tight">
            <p className="text-[13px] font-medium">Alex Johnson</p>
            <p className="text-[11px] text-white/45">Admin</p>
          </div>
          <ChevronDown size={14} className="text-white/45" />
        </button>
      </div>
    </header>
  );
}
