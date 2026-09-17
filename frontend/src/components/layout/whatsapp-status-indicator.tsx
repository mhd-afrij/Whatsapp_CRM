"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { cn } from "@/lib/utils";
import { CONNECTION_STATE_VIEW } from "@/lib/whatsapp-connection";
import type { CanonicalConnectionState } from "@/lib/whatsapp-connection";

/**
 * Small always-visible indicator of the workspace's WhatsApp connection
 * state, so a dropped session (or a temporarily unreachable gateway) is
 * noticeable from anywhere in the app, not just on the dedicated settings
 * page. Uses the canonical state so a gateway outage reads as a distinct,
 * recoverable "gateway unavailable" state instead of a scary error.
 */
export function WhatsappStatusIndicator() {
  const canManage = usePermission("whatsapp.connection.manage");
  const { data, canonicalState } = useWhatsappStatus({ enabled: canManage });

  if (!canManage) {
    return null;
  }

  const state: CanonicalConnectionState = canonicalState;
  const view = CONNECTION_STATE_VIEW[state];
  const label = view.label;

  const detail =
    state === "connected"
      ? data?.phoneNumber
        ? `Connected ${data.phoneNumber}`
        : "Connected"
      : state === "gateway_unavailable"
        ? "Gateway temporarily unavailable — retrying"
        : state === "connecting" && data?.qrCode
          ? "Waiting for QR scan"
          : view.label;

  return (
    <Link
      href="/settings/workspace/whatsapp"
      title={label}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-primary-soft/40 hover:text-text"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      <span className={cn("h-2 w-2 rounded-full", view.dotClass)} />
      <span className="hidden lg:inline">{detail}</span>
      <span className="lg:hidden">{label}</span>
    </Link>
  );
}
