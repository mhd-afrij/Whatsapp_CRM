import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { resolveMessageType, buildBaileysMediaContent, type OutboundMediaInfo } from './outbound-media';

const info: OutboundMediaInfo = {
  storagePath: '1/outbound/abc.jpg',
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  sizeBytes: 1024,
  checksumSha256: 'deadbeef',
};

function isReadable(value: unknown): value is Readable {
  return value instanceof Readable;
}

describe('resolveMessageType', () => {
  it.each([
    ['image/jpeg', 'image'],
    ['image/png', 'image'],
    ['video/mp4', 'video'],
    ['audio/mpeg', 'audio'],
    ['audio/ogg', 'audio'],
    ['application/pdf', 'document'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  ])('maps %s -> %s', (mime, expected) => {
    expect(resolveMessageType(mime)).toBe(expected);
  });
});

describe('buildBaileysMediaContent', () => {
  const buffer = Buffer.from('fake image bytes');

  it('builds an image content object with a stream and mimetype', () => {
    const content = buildBaileysMediaContent('image', buffer, info, null);
    expect(content.image).toBeDefined();
    expect(isReadable((content.image as { stream: unknown }).stream)).toBe(true);
    expect(content.mimetype).toBe('image/jpeg');
    expect(content.caption).toBeUndefined();
  });

  it('adds a caption when provided (image/video)', () => {
    const content = buildBaileysMediaContent('video', buffer, info, 'Look at this');
    expect((content.video as { stream: unknown }).stream).toBeDefined();
    expect(content.caption).toBe('Look at this');
  });

  it('builds a document with a fileName fallback', () => {
    const content = buildBaileysMediaContent('document', buffer, { ...info, fileName: null }, null);
    expect(content.document).toBeDefined();
    expect(content.fileName).toBe('document');
  });

  it('uses the real fileName when provided for documents', () => {
    const content = buildBaileysMediaContent('document', buffer, info, 'Important');
    expect(content.fileName).toBe('photo.jpg');
    expect(content.caption).toBe('Important');
  });

  it('builds an audio content object flagged as non-voice', () => {
    const content = buildBaileysMediaContent('audio', buffer, info, null);
    expect(content.audio).toBeDefined();
    expect(content.ptt).toBe(false);
    expect(content.caption).toBeUndefined();
  });
});
