import { describe, it, expect } from 'vitest';
import { normalizeInboundMessage } from './message-normalizer';
import type { BaileysRawMessage } from './baileys-socket';

/**
 * Phase 18 gap fill: message-normalizer.ts had zero direct test coverage
 * before this. These specifically probe malformed/partial Baileys event
 * payloads (missing fields) so a bad event from a real WhatsApp session
 * cannot crash the inbound pipeline - it should always resolve to either
 * `{ ok: true }` or `{ ok: false, reason }`, never throw.
 */
describe('normalizeInboundMessage', () => {
  it('normalizes a plain text (conversation) message', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG1', remoteJid: '1555@s.whatsapp.net' },
      pushName: 'Alice',
      messageTimestamp: 1700000000,
      message: { conversation: 'hello there' },
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.messageType).toBe('text');
      expect(result.normalized.body).toBe('hello there');
      expect(result.normalized.whatsappMessageId).toBe('MSG1');
    }
  });

  it('normalizes an extendedTextMessage', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG2', remoteJid: '1555@s.whatsapp.net' },
      message: { extendedTextMessage: { text: 'extended text' } },
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.body).toBe('extended text');
    }
  });

  it('normalizes a media message and parses a string fileLength', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG3', remoteJid: '1555@s.whatsapp.net' },
      message: {
        imageMessage: { mimetype: 'image/png', fileLength: '12345', caption: 'a photo' },
      },
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.messageType).toBe('image');
      expect(result.normalized.media).toEqual({ mimeType: 'image/png', fileSizeBytes: 12345 });
      expect(result.normalized.body).toBe('a photo');
    }
  });

  it('defaults a media message with no fileLength/mimetype/caption to safe fallbacks', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG4', remoteJid: '1555@s.whatsapp.net' },
      message: { documentMessage: {} },
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.media).toEqual({ mimeType: 'application/octet-stream', fileSizeBytes: null });
      expect(result.normalized.body).toBeNull();
    }
  });

  it('rejects a payload missing key.id without throwing', () => {
    const raw = {
      key: { remoteJid: '1555@s.whatsapp.net' },
      message: { conversation: 'hi' },
    } as BaileysRawMessage;

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('missing key.id');
    }
  });

  it('rejects a payload missing key.remoteJid without throwing', () => {
    const raw = {
      key: { id: 'MSG5' },
      message: { conversation: 'hi' },
    } as BaileysRawMessage;

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(false);
  });

  it('rejects a payload with a completely absent message field without throwing', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG6', remoteJid: '1555@s.whatsapp.net' },
      message: null,
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unsupported message kind');
    }
  });

  it('marks reactionMessage as a distinct, explicit non-message reason (not silently dropped)', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG7', remoteJid: '1555@s.whatsapp.net' },
      message: { reactionMessage: { text: '👍' } },
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('reaction_message');
    }
  });

  it('falls back to the current time when messageTimestamp is missing', () => {
    const before = Date.now();
    const raw: BaileysRawMessage = {
      key: { id: 'MSG8', remoteJid: '1555@s.whatsapp.net' },
      message: { conversation: 'no timestamp' },
    };

    const result = normalizeInboundMessage(raw);
    const after = Date.now();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sentAtMs = result.normalized.sentAt.getTime();
      expect(sentAtMs).toBeGreaterThanOrEqual(before);
      expect(sentAtMs).toBeLessThanOrEqual(after);
    }
  });

  it('parses a string messageTimestamp', () => {
    const raw: BaileysRawMessage = {
      key: { id: 'MSG9', remoteJid: '1555@s.whatsapp.net' },
      messageTimestamp: '1700000000',
      message: { conversation: 'string ts' },
    };

    const result = normalizeInboundMessage(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.sentAt.getTime()).toBe(1700000000 * 1000);
    }
  });
});
