import { describe, it, expect } from 'vitest';
import { normalizePhoneToJid } from './jid';

describe('normalizePhoneToJid', () => {
  it('normalizes a national number with a leading trunk zero to E.164', () => {
    expect(normalizePhoneToJid('0750144774')).toBe('94750144774@s.whatsapp.net');
  });

  it('prefixes the country code to a short local number with no trunk zero', () => {
    expect(normalizePhoneToJid('765655026')).toBe('94765655026@s.whatsapp.net');
  });

  it('leaves an already-international number untouched', () => {
    expect(normalizePhoneToJid('94765655026')).toBe('94765655026@s.whatsapp.net');
  });

  it('handles a plus-prefixed, space/separator-laden input', () => {
    expect(normalizePhoneToJid('+94 76 5655 026')).toBe('94765655026@s.whatsapp.net');
  });

  it('renormalizes a bad stored JID on s.whatsapp.net', () => {
    expect(normalizePhoneToJid('0750144774@s.whatsapp.net')).toBe('94750144774@s.whatsapp.net');
  });

  it('leaves a correct E.164 JID untouched', () => {
    expect(normalizePhoneToJid('94750144774@s.whatsapp.net')).toBe('94750144774@s.whatsapp.net');
  });

  it('does not touch group JIDs', () => {
    expect(normalizePhoneToJid('120363000000000000@g.us')).toBe('120363000000000000@g.us');
  });

  it('honors the configured country code', () => {
    expect(normalizePhoneToJid('0750144774', '1')).toBe('1750144774@s.whatsapp.net');
  });

  it('rejects empty input', () => {
    expect(() => normalizePhoneToJid('')).toThrow();
  });
});
