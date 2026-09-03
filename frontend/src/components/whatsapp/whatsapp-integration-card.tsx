"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Activity,
  Clock3,
  Loader2,
  Phone,
  PlugZap,
  QrCode,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";
import {
  useWhatsappActions,
  useWhatsappConnectionHistory,
  useWhatsappStatus,
} from "@/hooks/use-whatsapp-connection";
import type {
  WhatsappConnectionEvent,
  WhatsappConnectionStatus,
} from "@/lib/whatsapp-api";
import { cn } from "@/lib/utils";

const QR_TTL_SECONDS = 60;

function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

type IntegrationStatus = "connected" | "disconnected" | "connecting";

const BADGE_STYLES: Record<IntegrationStatus, string> = {
  connected: "bg-success-light text-success-dark border-success",
  disconnected: "bg-danger-light text-danger-dark border-danger",
  connecting: "bg-warning-light text-warning-dark border-warning",
};

const STATUS_DOT_STYLES: Record<IntegrationStatus, string> = {
  connected: "bg-success",
  disconnected: "bg-danger",
  connecting: "bg-warning",
};

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  connecting: "Connecting",
};

const EVENT_LABELS: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting",
  qr_generated: "QR code generated",
  disconnected: "Disconnected",
  reconnect_attempt: "Reconnect attempt",
  logged_out: "Logged out",
  bad_session: "Session reset",
  error: "Connection error",
};

function toIntegrationStatus(status: WhatsappConnectionStatus): IntegrationStatus {
  if (status === "connected") return "connected";
  if (status === "idle" || status === "disconnected") return "disconnected";
  return "connecting";
}

function formatEventType(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function StatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
        BADGE_STYLES[status]
      )}
    >
      <span
        className={cn("h-2 w-2 rounded-full", STATUS_DOT_STYLES[status])}
        aria-hidden="true"
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function MetadataItem({
  icon: Icon,
  label,
  value,
  hint,
  dateTime,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  dateTime?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 p-4">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2">
        {loading ? (
          <div
            className="h-5 w-2/3 animate-pulse rounded bg-border"
            aria-hidden="true"
          />
        ) : dateTime ? (
          <time dateTime={dateTime} className="text-lg font-semibold text-text">
            {value}
          </time>
        ) : (
          <span className="text-lg font-semibold text-text">{value}</span>
        )}
        {!loading && hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </dd>
    </div>
  );
}

function EmptyState({
  onConnect,
  isPending,
}: {
  onConnect: () => void;
  isPending: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-text">Not connected</p>
      <p className="mt-1 max-w-md text-sm text-muted">
        Connect your workspace to a WhatsApp number to start sending and receiving
        messages from the inbox.
      </p>

      <button
        type="button"
        onClick={onConnect}
        disabled={isPending}
        aria-label="Connect WhatsApp"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-success/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success disabled:pointer-events-none disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <PlugZap className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? "Connecting…" : "Connect WhatsApp"}
      </button>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <MetadataItem icon={Phone} label="Phone Number" value="—" hint="Shown once connected" />
        <MetadataItem icon={Clock3} label="Connected Since" value="—" hint="Awaiting first pairing" />
        <MetadataItem icon={Activity} label="Last Activity" value="—" hint="Awaiting first activity" />
      </dl>
    </div>
  );
}

function ActivityList({
  events,
  isLoading,
}: {
  events: WhatsappConnectionEvent[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <ul className="mt-4 space-y-3" aria-busy="true" aria-label="Loading activity">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="animate-pulse rounded-lg border border-border bg-surface/50 p-3"
          >
            <div className="h-3 w-1/2 rounded bg-border" />
            <div className="mt-2 h-2.5 w-1/3 rounded bg-border" />
          </li>
        ))}
      </ul>
    );
  }

  if (!events || events.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        No activity yet. QR scans, connections, and disconnects will appear here.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {events.slice(0, 8).map((event) => (
        <li
          key={event.id}
          className="flex items-start gap-3 rounded-lg border border-border bg-surface/50 p-3"
        >
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {formatEventType(event.event_type)}
            </p>
            <time dateTime={event.occurred_at} className="text-xs text-muted">
              {formatDateTime(event.occurred_at)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * WhatsApp Integration Dashboard Card.
 *
 * Renders a 2/3 + 1/3 dashboard: the main status card (left) and a recent
 * activity sidebar (right). The app's dashboard shell already provides
 * <main>, so this roots in <section>/<aside> to avoid nested landmarks.
 *
 * Maps the gateway's 8-state machine down to the 3 UI states the card
 * distinguishes: connected, disconnected (idle/disconnected), connecting
 * (connecting, qr_pending, reconnecting, auth_required, error).
 */
export function WhatsappIntegrationCard() {
  const { data: status, isLoading } = useWhatsappStatus();
  const { data: events, isLoading: historyLoading } = useWhatsappConnectionHistory();
  const { connect, reconnect } = useWhatsappActions();
  const now = useNow();

  const integrationStatus = toIntegrationStatus(status?.status ?? "idle");
  const phoneNumber = status?.phoneNumber ?? null;
  const connectedSinceEvent = events?.find((event) => event.event_type === "connected") ?? null;
  const latestEvent = events?.[0] ?? null;
  const isPending = connect.isPending;
  const showConnectCta = integrationStatus === "disconnected";
  const metadataLoading = isLoading && !status;

  const currentStatus: WhatsappConnectionStatus = status?.status ?? "idle";
  const qrExpiresAtMs = status?.qrExpiresAt ? new Date(status.qrExpiresAt).getTime() : null;
  const qrExpired = !!qrExpiresAtMs && qrExpiresAtMs < now;
  const qrSecondsRemaining = qrExpiresAtMs
    ? Math.max(0, Math.ceil((qrExpiresAtMs - now) / 1000))
    : null;
  const qrProgress =
    qrSecondsRemaining !== null ? Math.max(0, Math.min(1, qrSecondsRemaining / QR_TTL_SECONDS)) : 0;

  const handleConnect = () => {
    if (isPending) return;
    connect.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
      <section
        aria-labelledby="whatsapp-integration-title"
        className="rounded-xl border border-border bg-surface p-6 lg:col-span-2"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              WhatsApp Integration
            </p>
            <h2
              id="whatsapp-integration-title"
              className="mt-1 text-xl font-semibold text-text"
            >
              WhatsApp Connection
            </h2>
          </div>
          <StatusBadge status={integrationStatus} />
        </header>

        <div className="mt-6">
          {showConnectCta ? (
            <EmptyState onConnect={handleConnect} isPending={isPending} />
          ) : currentStatus === "qr_pending" ? (
            <>
              <div className="mb-6 pb-6 border-b border-border">
                <div className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                  <QrCode className="h-3.5 w-3.5" />
                  Pairing required
                </div>
                <p className="mt-3 text-sm text-muted">
                  Open WhatsApp on your phone, go to{" "}
                  <span className="font-medium text-text">Linked Devices</span>, then scan the QR to
                  finish connecting.
                </p>
              </div>
              <div className="mt-6 flex justify-center rounded-2xl border border-border bg-bg/60 p-6">
                {qrExpired ? (
                  <div
                    role="status"
                    className="flex h-[240px] w-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-danger/40 bg-danger/5 text-center text-sm text-danger"
                  >
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">QR expired</p>
                      {reconnect.isPending && <p className="text-xs opacity-75">Refreshing...</p>}
                    </div>
                  </div>
                ) : status?.qrCode ? (
                  <Image
                    src={status.qrCode}
                    alt="QR code — open WhatsApp on your phone and scan with Linked Devices to pair this workspace"
                    role="img"
                    width={240}
                    height={240}
                    unoptimized
                    className="rounded-xl"
                  />
                ) : (
                  <div
                    role="status"
                    className="flex h-[240px] w-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg text-sm text-muted"
                  >
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Preparing QR...
                  </div>
                )}
              </div>
              {qrSecondsRemaining !== null && !qrExpired && (
                <div className="mt-4 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-warning transition-all duration-1000 ease-linear"
                      style={{ width: `${qrProgress * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">QR expires in {qrSecondsRemaining}s.</p>
                </div>
              )}
              {qrExpired && (
                <p className="mt-4 text-sm text-danger">
                  This QR code has expired. A new one is being generated automatically.
                </p>
              )}
            </>
          ) : (
            <>
              {integrationStatus === "connecting" && (
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Establishing connection…
                </p>
              )}
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetadataItem
                  icon={Phone}
                  label="Phone Number"
                  value={phoneNumber ?? "Not available"}
                  loading={metadataLoading}
                />
                <MetadataItem
                  icon={Clock3}
                  label="Connected Since"
                  value={formatDateTime(connectedSinceEvent?.occurred_at ?? null)}
                  dateTime={connectedSinceEvent?.occurred_at}
                  loading={metadataLoading}
                />
                <MetadataItem
                  icon={Activity}
                  label="Last Activity"
                  value={formatDateTime(latestEvent?.occurred_at ?? null)}
                  dateTime={latestEvent?.occurred_at}
                  loading={metadataLoading}
                />
              </dl>
            </>
          )}
        </div>
      </section>

      <aside
        aria-label="Recent WhatsApp activity"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Activity className="h-4 w-4 text-muted" aria-hidden="true" />
          Recent activity
        </h3>
        <ActivityList events={events} isLoading={historyLoading} />
      </aside>
      </div>

    </div>
  );
}
