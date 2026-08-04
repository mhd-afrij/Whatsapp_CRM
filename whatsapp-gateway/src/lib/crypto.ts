import crypto from 'node:crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  return Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypts a plaintext string for storage in whatsapp_session_credentials.value.
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptCredentialValue(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts a value produced by encryptCredentialValue.
 */
export function decryptCredentialValue(stored: string): string {
  const [ivB64, tagB64, cipherB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error('Malformed encrypted credential value');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
