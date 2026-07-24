"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import { QrCode, Radio, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { syncRequest } from "@/lib/sync-client";
import { getSyncSocket } from "@/lib/socket-client";
import type { SyncServiceStatus } from "@/types/admin";

export default function WhatsAppConnectionPage() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["whatsapp-sync-status"],
    queryFn: () => syncRequest<SyncServiceStatus>("/internal/v1/session/status"),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const socket = getSyncSocket();
    const onUpdate = (payload: SyncServiceStatus) => {
      queryClient.setQueryData(["whatsapp-sync-status"], payload);
    };
    socket.on("session:update", onUpdate);
    return () => {
      socket.off("session:update", onUpdate);
    };
  }, [queryClient]);

  const generateQr = useMutation({
    mutationFn: () => syncRequest<SyncServiceStatus>("/internal/v1/session/qr", { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(["whatsapp-sync-status"], data),
  });

  const unlink = useMutation({
    mutationFn: () => syncRequest<SyncServiceStatus>("/internal/v1/session/unlink", { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(["whatsapp-sync-status"], data),
  });

  const status = sessionQuery.data?.session ?? "unlinked";
  const isHealthy = sessionQuery.data?.status === "healthy";
  const qrCode = sessionQuery.data?.qr_code ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Connection"
        description="Link this workspace's WhatsApp account and monitor sync state in real time."
      />

      <div className="max-w-2xl grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[10px] border border-border bg-surface p-8">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-surface-raised flex items-center justify-center">
              <QrCode size={24} className="text-text-muted" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary mb-1">
                {status === "linked" ? "Connected" : status === "connecting" ? "Waiting for scan" : "Not connected"}
              </p>
              <p className="text-sm text-text-muted">
                {status === "linked"
                  ? `Device ${sessionQuery.data?.device_name ?? "unknown"} is linked and healthy.`
                  : "Generate a QR code, then scan it from WhatsApp on your phone under Linked Devices."}
              </p>
            </div>
          </div>

          {status === "connecting" && (
            <div className="mt-6 flex justify-center rounded-md border border-border-muted bg-background p-6">
              {qrCode ? (
                <QRCode value={qrCode} size={180} />
              ) : (
                <p className="text-sm text-text-muted">Waiting for QR code from WhatsApp…</p>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => generateQr.mutate()}
              disabled={generateQr.isPending || status === "linked"}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {generateQr.isPending ? "Starting…" : "Generate QR code"}
            </button>
            <button
              type="button"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending || status === "unlinked"}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-60"
            >
              {unlink.isPending ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>

          <div className="mt-6 rounded-md border border-border-muted bg-background p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-text-secondary">Sync service</span>
              <span className={isHealthy ? "text-success" : "text-warning"}>
                {sessionQuery.isLoading ? "Loading..." : sessionQuery.data?.status ?? "unknown"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 mt-2">
              <span className="text-text-secondary">Last seen</span>
              <span className="text-text-primary">
                {sessionQuery.data?.last_seen_at ? new Date(sessionQuery.data.last_seen_at).toLocaleString() : "Never"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <div className="flex items-center gap-2 mb-2">
              <Radio size={16} className="text-primary" />
              <p className="text-sm font-medium text-text-primary">Live session state</p>
            </div>
            <p className="text-sm text-text-muted">
              Connection status and QR codes update instantly over a live socket connection to the sync
              service, backed by a real WhatsApp Web session (Baileys).
            </p>
          </div>
          <div className="rounded-[10px] border border-warning/30 bg-warning/10 p-4 flex gap-2">
            <ShieldAlert size={16} className="text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-text-secondary">
              Scanning the QR code links your real WhatsApp account. Disconnecting logs the session out of
              WhatsApp and clears locally stored credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
