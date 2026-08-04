import { describe, it, expect, vi, beforeEach } from 'vitest';

const emit = vi.fn();
const on = vi.fn();
const to = vi.fn(() => ({ to, emit }));
const of = vi.fn(() => ({ to, emit, on }));
const adapter = vi.fn();

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(function FakeServer() {
    return { of, adapter };
  }),
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(() => 'fake-adapter'),
}));

vi.mock('../lib/redis', () => ({
  getRedisClient: vi.fn(() => ({ duplicate: vi.fn(() => ({})) })),
}));

describe('socket-server event envelope', () => {
  beforeEach(() => {
    vi.resetModules();
    emit.mockClear();
    to.mockClear();
    of.mockClear();
  });

  it('wraps every emitted event in {event_id, event_type, workspace_id, occurred_at, data}', async () => {
    const { createSocketServer, emitMessageCreated } = await import('./socket-server');
    createSocketServer({} as never);

    emitMessageCreated(7, 42, { body: 'hi' });

    expect(emit).toHaveBeenCalledTimes(1);
    const [eventName, envelope] = emit.mock.calls[0];
    expect(eventName).toBe('message.created');
    expect(envelope).toMatchObject({
      event_type: 'message.created',
      workspace_id: 7,
      data: { body: 'hi' },
    });
    expect(typeof envelope.event_id).toBe('string');
    expect(envelope.event_id.length).toBeGreaterThan(0);
    expect(new Date(envelope.occurred_at).toString()).not.toBe('Invalid Date');
  });

  it('gives every event a distinct event_id', async () => {
    const { createSocketServer, emitConversationRead } = await import('./socket-server');
    createSocketServer({} as never);

    emitConversationRead(1, 2, {});
    emitConversationRead(1, 2, {});

    const firstId = emit.mock.calls[0][1].event_id;
    const secondId = emit.mock.calls[1][1].event_id;
    expect(firstId).not.toBe(secondId);
  });

  it('does nothing before createSocketServer has been called', async () => {
    const { emitMessageUpdated } = await import('./socket-server');
    emitMessageUpdated(1, 2, {});
    expect(emit).not.toHaveBeenCalled();
  });
});
