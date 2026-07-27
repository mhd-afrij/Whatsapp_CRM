import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import { QrCode } from "lucide-react";
import { syncRequest } from "../../services/chatService.js";

export default function WhatsAppConnectionPage() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["whatsapp-sync-status"],
    queryFn: () => syncRequest("/internal/v1/session/status"),
    refetchInterval: 10000,
  });

  const generateQr = useMutation({
    mutationFn: () => syncRequest("/internal/v1/session/qr", { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(["whatsapp-sync-status"], data),
  });

  const unlink = useMutation({
    mutationFn: () => syncRequest("/internal/v1/session/unlink", { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(["whatsapp-sync-status"], data),
  });

  const status = sessionQuery.data?.session ?? "unlinked";
  const qrCode = sessionQuery.data?.qr_code ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">WhatsApp Connection</h1>
        <p className="text-sm text-text-muted mt-1">Link this workspace's WhatsApp account and monitor sync state in real time.</p>
      </div>

      <div className="max-w-2xl rounded-[10px] border border-border bg-surface p-8">
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
                ? `Device ${sessionQuery.data?.device_name ?? "unknown"} is linked.`
                : "Generate a QR code, then scan it from WhatsApp on your phone."}
            </p>
          </div>
        </div>

        {status === "connecting" && (
          <div className="mt-6 flex justify-center rounded-md border border-border-muted bg-background p-6">
            {qrCode ? <QRCode value={qrCode} size={180} /> : <p className="text-sm text-text-muted">Waiting for QR code...</p>}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => generateQr.mutate()} disabled={generateQr.isPending || status === "linked"} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
            {generateQr.isPending ? "Starting..." : "Generate QR code"}
          </button>
          <button onClick={() => unlink.mutate()} disabled={unlink.isPending || status === "unlinked"} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-60">
            {unlink.isPending ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}
