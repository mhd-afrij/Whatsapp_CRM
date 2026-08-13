'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWhatsappHealth } from '@/lib/whatsapp-api';

function StatusDot({ status }: { status: 'ok' | 'error' }) {
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${status === 'ok' ? 'bg-success' : 'bg-danger'}`} />
  );
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  qr_pending: 'QR Pending',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
  auth_required: 'Auth Required',
  error: 'Error',
  idle: 'Idle',
};

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-success-light text-success-dark',
  qr_pending: 'bg-warning-light text-warning-dark',
  connecting: 'bg-info-light text-info-dark',
  disconnected: 'bg-danger-light text-danger-dark',
  reconnecting: 'bg-warning-light text-warning-dark',
  auth_required: 'bg-danger-light text-danger-dark',
  error: 'bg-danger-light text-danger-dark',
  idle: 'bg-muted/10 text-muted',
};

export default function WhatsappHealthPage() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['whatsapp-health'],
    queryFn: fetchWhatsappHealth,
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Health</h1>
          <p className="text-sm text-muted">Connection and infrastructure status</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-surface/80 disabled:opacity-50 transition-colors"
        >
          {isRefetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted">Loading health status...</div>
      ) : !data ? (
        <div className="rounded-lg border border-danger-light bg-danger-light p-8 text-center text-danger-dark">
          Failed to load health status. Is the gateway reachable?
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="mb-2 text-lg font-semibold text-text">WhatsApp Connection</h2>
            <p className="mb-4 text-sm text-muted">Current WhatsApp socket status</p>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {STATUS_LABELS[data.whatsapp.status] ?? data.whatsapp.status}
                </div>
                {data.whatsapp.phoneNumber && (
                  <div className="mt-1 text-sm text-muted">Phone: {data.whatsapp.phoneNumber}</div>
                )}
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[data.whatsapp.status] ?? 'bg-muted/10 text-muted'}`}>
                {data.whatsapp.status}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-6">
              <h3 className="mb-2 font-semibold text-text">Redis</h3>
              <p className="mb-3 text-sm text-muted">Cache and pub/sub connectivity</p>
              <div className="flex items-center gap-3">
                <StatusDot status={data.infrastructure.redis} />
                <span className="text-lg font-medium capitalize text-text">{data.infrastructure.redis}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-6">
              <h3 className="mb-2 font-semibold text-text">MySQL</h3>
              <p className="mb-3 text-sm text-muted">Database connectivity</p>
              <div className="flex items-center gap-3">
                <StatusDot status={data.infrastructure.mysql} />
                <span className="text-lg font-medium capitalize text-text">{data.infrastructure.mysql}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
