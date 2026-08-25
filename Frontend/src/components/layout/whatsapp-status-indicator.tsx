"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { useWhatsappStatus } from "@/hooks/use-whatsapp-connection";
import { cn } from "@/lib/utils";
import type { WhatsappConnectionStatus } from "@/lib/whatsapp-api";

const DOT_STYLES: Record<WhatsappConnectionStatus, string> = {
  idle: "bg-muted",
  connecting: "bg-warning animate-pulse",
  qr_pending: "bg-warning animate-pulse",
  connected: "bg-success",
  disconnected: "bg-danger",
  reconnecting: "bg-warning animate-pulse",
  auth_required: "bg-danger",
  error: "bg-danger",
};

const LABELS: Record<WhatsappConnectionStatus, string> = {
  idle: "WhatsApp not connected",
  connecting: "WhatsApp connecting",
  qr_pending: "WhatsApp awaiting QR scan",
  connected: "WhatsApp connected",
  disconnected: "WhatsApp disconnected",
  reconnecting: "WhatsApp reconnecting",
  auth_required: "WhatsApp re-authentication required",
  error: "WhatsApp connection error",
};

/**
 * Small always-visible indicator of the workspace's WhatsApp connection
 * state, so a dropped session is noticeable from anywhere in the app, not
 * just on the dedicated settings page.
 */
export function WhatsappStatusIndicator() {
  const canManage = usePermission("whatsapp.connection.manage");
  const { data } = useWhatsappStatus({ enabled: canManage });

  if (!canManage) {
    return null;
  }

  const status = data?.status ?? "idle";
  const label = LABELS[status];
  const detail =
    status === "connected"
      ? data?.phoneNumber
        ? `Connected ${data.phoneNumber}`
        : "Connected"
      : status === "qr_pending"
        ? "Waiting for QR scan"
        : label;

  return (
    <Link
      href="/settings/whatsapp"
      title={label}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-primary-soft/40 hover:text-text"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      <span className={cn("h-2 w-2 rounded-full", DOT_STYLES[status])} />
      <span className="hidden lg:inline">{detail}</span>
      <span className="lg:hidden">{label}</span>
    </Link>
  );
}
