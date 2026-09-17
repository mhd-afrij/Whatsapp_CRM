import { isGatewayRecoverableError } from "@/lib/api-client";
import type {
  WhatsappConnectionStatus,
  WhatsappStatus,
} from "@/lib/whatsapp-api";

/**
 * Canonical WhatsApp connection states used across the whole frontend UI.
 * Every raw gateway status (whatsapp-api.ts) and every backend failure is
 * reduced to one of these so the UI never switches on raw strings in
 * different places:
 *
 *   - connected                 session is live
 *   - connecting                initial connection / QR waiting to be scanned
 *   - reconnecting              gateway is re-establishing the session
 *   - disconnected              no active session
 *   - authentication_required   session ended; phone must re-pair via QR
 *   - failure                   a real WhatsApp connection error
 *   - gateway_unavailable       the whatsapp-gateway service itself is down /
 *                               not ready (recoverable, retry automatically)
 */
export type CanonicalConnectionState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected"
  | "authentication_required"
  | "failure"
  | "gateway_unavailable";

const RAW_TO_CANONICAL: Record<WhatsappConnectionStatus, CanonicalConnectionState> = {
  idle: "connecting",
  connecting: "connecting",
  qr_pending: "connecting",
  connected: "connected",
  disconnected: "disconnected",
  reconnecting: "reconnecting",
  auth_required: "authentication_required",
  error: "failure",
};

/** Presentational metadata for each canonical state (colors match the app's tailwind tokens). */
export interface ConnectionStateView {
  label: string;
  description: string;
  /** Dot/indicator color utility class. */
  dotClass: string;
  /** Whether this state represents a recoverable, self-healing condition. */
  recoverable: boolean;
}

export const CONNECTION_STATE_VIEW: Record<CanonicalConnectionState, ConnectionStateView> = {
  connected: {
    label: "Connected",
    description: "WhatsApp is connected and ready.",
    dotClass: "bg-success",
    recoverable: false,
  },
  connecting: {
    label: "Connecting",
    description: "Establishing the WhatsApp connection…",
    dotClass: "bg-warning animate-pulse",
    recoverable: false,
  },
  reconnecting: {
    label: "Reconnecting",
    description: "Reconnecting your WhatsApp session…",
    dotClass: "bg-warning animate-pulse",
    recoverable: false,
  },
  disconnected: {
    label: "Disconnected",
    description: "The WhatsApp session is disconnected.",
    dotClass: "bg-danger",
    recoverable: false,
  },
  authentication_required: {
    label: "Re-authentication required",
    description: "The session ended and must be re-paired by scanning a QR code.",
    dotClass: "bg-danger",
    recoverable: false,
  },
  failure: {
    label: "Connection error",
    description: "Something went wrong with the WhatsApp connection.",
    dotClass: "bg-danger",
    recoverable: false,
  },
  gateway_unavailable: {
    label: "Gateway unavailable",
    description: "WhatsApp gateway is temporarily unavailable.",
    dotClass: "bg-warning animate-pulse",
    recoverable: true,
  },
};

/**
 * Reduces a successful status payload (or its absence) to a canonical state.
 * While there is no data yet we optimistically show "connecting".
 */
export function resolveCanonicalState(status?: WhatsappStatus): CanonicalConnectionState {
  if (!status) return "connecting";
  return RAW_TO_CANONICAL[status.status] ?? "connecting";
}

export { isGatewayRecoverableError };