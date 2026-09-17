/**
 * Maps a live gateway QR snapshot (WhatsappAccountSnapshot / partial
 * WhatsappStatus) onto the UI states required by the Add WhatsApp Account
 * flow: generating | waiting | connecting | connected | expired | error.
 *
 * The gateway (Baileys) is the only source of QR codes - this module never
 * fabricates one; it only classifies what the backend reported.
 */

export type WhatsappQrState = "generating" | "waiting" | "connecting" | "connected" | "expired" | "error";

export interface WhatsappQrInput {
  status: string | null | undefined;
  qrCode: string | null | undefined;
  qrExpiresAt: string | null | undefined;
  error?: string | null;
}

export function resolveWhatsappQrState(
  { status, qrCode, qrExpiresAt, error }: WhatsappQrInput,
  now: Date = new Date()
): WhatsappQrState {
  if (error) return "error";
  if (status === "connected") return "connected";
  if (status === "connecting" || status === "reconnecting") return "connecting";
  if (!qrCode) return "generating";
  if (qrExpiresAt) {
    const expiry = new Date(qrExpiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()) {
      return "expired";
    }
  }
  return "waiting";
}

/** Human-readable hint line shown under the QR for the current state. */
export function whatsappQrStateHint(state: WhatsappQrState): string {
  switch (state) {
    case "generating":
      return "Generating QR...";
    case "waiting":
      return "Waiting for WhatsApp connection...";
    case "connecting":
      return "Connecting...";
    case "connected":
      return "WhatsApp connected successfully.";
    case "expired":
      return "QR expired. Generate a new code to continue.";
    case "error":
      return "WhatsApp connection failed.";
  }
}
