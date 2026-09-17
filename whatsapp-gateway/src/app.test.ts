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

const { snapshot } = vi.hoisted(() => ({
  snapshot: vi.fn(),
}));
vi.mock('./whatsapp/manager-instance', () => ({
  connectionManager: {
    getSnapshot: () => snapshot(),
  },
}));

import { createApp } from './app';

type JsonBody = Record<string, unknown>;
const readJson = (res: Response): Promise<JsonBody> => res.json() as Promise<JsonBody>;

describe('health and readiness endpoints', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
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
    });
    expect(body).not.toHaveProperty('infrastructure');
    expect(redisPing).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
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