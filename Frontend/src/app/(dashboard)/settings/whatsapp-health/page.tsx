'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWhatsappHealth } from '@/lib/whatsapp-api';

function StatusDot({ status }: { status: 'ok' | 'error' }) {
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
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
  connected: 'bg-green-100 text-green-800',
  qr_pending: 'bg-yellow-100 text-yellow-800',
  connecting: 'bg-blue-100 text-blue-800',
  disconnected: 'bg-red-100 text-red-800',
  reconnecting: 'bg-yellow-100 text-yellow-800',
  auth_required: 'bg-red-100 text-red-800',
  error: 'bg-red-100 text-red-800',
  idle: 'bg-gray-100 text-gray-800',
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
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {isRefetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted">Loading health status...</div>
      ) : !data ? (
        <div className="rounded-lg border bg-card p-8 text-center text-destructive">
          Failed to load health status. Is the gateway reachable?
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-2 text-lg font-semibold">WhatsApp Connection</h2>
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
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[data.whatsapp.status] ?? 'bg-gray-100 text-gray-800'}`}>
                {data.whatsapp.status}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-6">
              <h3 className="mb-2 font-semibold">Redis</h3>
              <p className="mb-3 text-sm text-muted">Cache and pub/sub connectivity</p>
              <div className="flex items-center gap-3">
                <StatusDot status={data.infrastructure.redis} />
                <span className="text-lg font-medium capitalize">{data.infrastructure.redis}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-6">
              <h3 className="mb-2 font-semibold">MySQL</h3>
              <p className="mb-3 text-sm text-muted">Database connectivity</p>
              <div className="flex items-center gap-3">
                <StatusDot status={data.infrastructure.mysql} />
                <span className="text-lg font-medium capitalize">{data.infrastructure.mysql}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
