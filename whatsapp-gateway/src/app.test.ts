import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

const { redisPing, poolQuery, isHealthy } = vi.hoisted(() => ({
  redisPing: vi.fn(),
  poolQuery: vi.fn(),
  isHealthy: vi.fn(),
}));

vi.mock('./lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/redis')>();
  return {
    ...actual,
    getRedisClient: vi.fn(() => ({ ping: () => redisPing() })),
  };
});

vi.mock('./lib/mysql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/mysql')>();
  return {
    ...actual,
    getMysqlPool: vi.fn(async () => ({ query: (...args: unknown[]) => poolQuery(...args) })),
    isHealthy: () => isHealthy(),
  };
});

const { snapshot, listAccountHealth } = vi.hoisted(() => ({
  snapshot: vi.fn(),
  listAccountHealth: vi.fn(),
}));
vi.mock('./whatsapp/manager-instance', () => ({
  connectionManager: {
    getSnapshot: () => snapshot(),
  },
  connectionRegistry: {
    listAccountHealth: () => listAccountHealth(),
  },
}));

import { createApp } from './app';
import { markShuttingDown, resetShutdownStateForTests } from './lib/lifecycle';

type JsonBody = Record<string, unknown>;
const readJson = (res: Response): Promise<JsonBody> => res.json() as Promise<JsonBody>;

describe('health and readiness endpoints', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    listAccountHealth.mockReturnValue([]);
    snapshot.mockReturnValue({
      workspaceId: 1,
      status: 'connected',
      qrCode: null,
      qrExpiresAt: null,
      phoneNumber: '254700000000',
    });

    const app = express();
    app.use(createApp());

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /healthz is process liveness only (200, no external dependency checks)', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({ status: 'ok' });
    expect(redisPing).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('GET /whatsapp/health reports the connection snapshot without embedding infrastructure checks', async () => {
    const res = await fetch(`${baseUrl}/whatsapp/health`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({
      status: 'ok',
      whatsapp: {
        status: 'connected',
        phoneNumber: '254700000000',
        qrPending: false,
      },
      accounts: [],
    });
    expect(body).not.toHaveProperty('infrastructure');
    expect(redisPing).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('GET /whatsapp/health lists per-account health entries (process healthy ≠ every account connected)', async () => {
    listAccountHealth.mockReturnValueOnce([
      {
        workspaceId: 1,
        accountId: 7,
        status: 'connected',
        connected: true,
        hasSocket: true,
        qrPending: false,
        reconnectAttempts: 0,
        lastConnectedAt: '2026-01-01T00:00:00.000Z',
        lastDisconnectedAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
      {
        workspaceId: 1,
        accountId: 8,
        status: 'reconnecting',
        connected: false,
        hasSocket: false,
        qrPending: false,
        reconnectAttempts: 3,
        lastConnectedAt: '2026-01-01T00:00:00.000Z',
        lastDisconnectedAt: '2026-01-01T00:01:00.000Z',
        lastErrorCode: '428',
        lastErrorAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    const res = await fetch(`${baseUrl}/whatsapp/health`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const accounts = body.accounts as Array<{ accountId: number; status: string; connected: boolean }>;
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({ accountId: 7, status: 'connected', connected: true });
    // One account's disconnect must not mark the process (or the other
    // account) unhealthy.
    expect(accounts[1]).toMatchObject({ accountId: 8, status: 'reconnecting', connected: false });
    expect((body.status as string)).toBe('ok');
    // No credentials/QR material may ever appear in the health payload.
    expect(JSON.stringify(body)).not.toContain('qrCode');
    expect(JSON.stringify(body)).not.toContain('cred');
  });

  it('GET /whatsapp/health reports qrPending when waiting for a QR scan', async () => {
    snapshot.mockReturnValue({
      workspaceId: 1,
      status: 'qr_pending',
      qrCode: 'data:image/png;base64,QR',
      qrExpiresAt: '2026-01-01T00:00:00.000Z',
      phoneNumber: null,
    });
    const res = await fetch(`${baseUrl}/whatsapp/health`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect((body.whatsapp as { qrPending?: boolean }).qrPending).toBe(true);
  });

  it('GET /readyz returns 503 and reports failed checks when upstreams are down', async () => {
    isHealthy.mockReturnValue(true);
    redisPing.mockRejectedValue(new Error('ECONNREFUSED'));
    poolQuery.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await fetch(`${baseUrl}/readyz`);
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.status).toBe('unavailable');
    expect(body.checks).toEqual({ redis: 'error', mysql: 'error' });
  });

  it('GET /readyz returns 200 when Redis and MySQL are reachable', async () => {
    isHealthy.mockReturnValue(true);
    redisPing.mockResolvedValue('PONG');
    poolQuery.mockResolvedValue([{ '1': 1 }]);

    const res = await fetch(`${baseUrl}/readyz`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual({ redis: 'ok', mysql: 'ok' });
  });

  it('GET /readyz treats an open MySQL circuit breaker as not ready', async () => {
    isHealthy.mockReturnValue(false);
    redisPing.mockResolvedValue('PONG');

    const res = await fetch(`${baseUrl}/readyz`);
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect((body.checks as Record<string, string>).mysql).toBe('error');
  });
});

/**
 * Phase 6.6 - graceful shutdown must stop accepting NEW internal operations
 * without claiming the process is dead. These assertions cover the drain
 * contract the load balancer and the Laravel GatewayClient rely on.
 */
describe('graceful shutdown drain contract', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetShutdownStateForTests();
    listAccountHealth.mockReturnValue([]);
    snapshot.mockReturnValue({ workspaceId: 1, status: 'connected', qrCode: null, qrExpiresAt: null, phoneNumber: null });

    const app = express();
    app.use(createApp());
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    resetShutdownStateForTests();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects new internal WhatsApp operations with 503 GATEWAY_SHUTTING_DOWN while draining', async () => {
    markShuttingDown();

    const res = await fetch(`${baseUrl}/internal/whatsapp/status`, {
      headers: { 'X-Internal-Gateway-Token': 'anything' },
    });

    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect((body.data as { code?: string }).code).toBe('GATEWAY_SHUTTING_DOWN');
    // Never even reach the token check / connection manager.
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('reports readiness as unavailable so load balancers drain the instance', async () => {
    isHealthy.mockReturnValue(true);
    redisPing.mockResolvedValue('PONG');
    poolQuery.mockResolvedValue([]);

    markShuttingDown();
    const res = await fetch(`${baseUrl}/readyz`);

    expect(res.status).toBe(503);
    // Redis/MySQL are still reachable - the instance is draining, not broken.
    expect(redisPing).not.toHaveBeenCalled();
  });

  it('keeps liveness answering so the process is not killed mid-drain', async () => {
    markShuttingDown();

    const res = await fetch(`${baseUrl}/healthz`);

    expect(res.status).toBe(200);
    expect((await readJson(res)).status).toBe('shutting_down');
  });

  it('accepts operations normally when the process is not draining', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/status`, {
      headers: { 'X-Internal-Gateway-Token': 'anything' },
    });

    // 401 comes from the token guard, proving the drain middleware let it through.
    expect(res.status).toBe(401);
  });
});