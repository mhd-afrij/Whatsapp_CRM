"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { cn } from "@/lib/utils";
import { CONNECTION_STATE_VIEW, type CanonicalConnectionState } from "@/lib/whatsapp-connection";
import { formatWhatsAppNumber } from "@/lib/phone";

/**
 * Short, color-coded status pill (never the raw device JID) shown in the
 * topbar. Full account details (plus number, description) live in the popover
 * so the topbar stays compact on small screens.
 */
const SHORT_STATE: Record<CanonicalConnectionState, { label: string; dotClass: string }> = {
  connected: { label: "Connected", dotClass: "bg-success" },
  connecting: { label: "Connecting", dotClass: "bg-warning animate-pulse" },
  reconnecting: { label: "Connecting", dotClass: "bg-warning animate-pulse" },
  disconnected: { label: "Disconnected", dotClass: "bg-muted" },
  authentication_required: { label: "QR Required", dotClass: "bg-danger" },
  failure: { label: "Connection Error", dotClass: "bg-danger" },
  gateway_unavailable: { label: "Disconnected", dotClass: "bg-warning animate-pulse" },
};

export function WhatsappStatusIndicator() {
  const canManage = usePermission("whatsapp.connection.manage");
  const { data, canonicalState } = useWhatsappStatus({ enabled: canManage });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!canManage) {
    return null;
  }

  const state: CanonicalConnectionState = canonicalState;
  const view = CONNECTION_STATE_VIEW[state];
  const short = SHORT_STATE[state];
  const phone = formatWhatsAppNumber(data?.phoneNumber);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`WhatsApp status: ${view.label}`}
        title={view.description}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft/40 hover:text-text"
      >
        <MessageCircle className="h-4 w-4" />
        <span className={cn("h-2 w-2 rounded-full", short.dotClass)} />
        <span className="hidden md:inline">{short.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-surface p-4 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">WhatsApp Account</p>
          <p className="mt-1 truncate text-sm font-medium text-text">{phone ?? "Not paired"}</p>
          <div className="mt-3 flex items-center gap-1.5 text-sm text-text">
            <span className={cn("h-2 w-2 rounded-full", short.dotClass)} />
            {short.label}
          </div>
          <p className="mt-0.5 text-xs text-muted">{view.description}</p>
          <Link
            href="/settings/workspace/whatsapp"
            onClick={() => setOpen(false)}
            className="mt-3 block text-xs font-medium text-primary hover:underline"
          >
            Manage connection
          </Link>
        </div>
      )}
    </div>
  );
}