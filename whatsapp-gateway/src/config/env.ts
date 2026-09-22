import dotenv from 'dotenv';
import os from 'node:os';
import { z } from 'zod';

// In tests (vitest) the environment must be DETERMINISTIC: vitest.setup.ts
// pins every required variable explicitly, and individual tests manipulate
// MEDIA_* variables directly. Re-reading the developer's .env here
// (dotenv does not override set vars, but DOES repopulate deleted ones) made
// storage nondeterministic - e.g. changing MEDIA_LOCAL_STORAGE_DIR in a test
// was silently undone by this line re-loading it from .env, breaking
// local-file expectations. Skipping dotenv under NODE_ENV=test changes
// nothing in dev/prod.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),

  MYSQL_HOST: z.string().min(1, 'MYSQL_HOST is required'),
  MYSQL_PORT: z.coerce.number().int().positive(),
  MYSQL_DATABASE: z.string().min(1, 'MYSQL_DATABASE is required'),
  MYSQL_USER: z.string().min(1, 'MYSQL_USER is required'),
  MYSQL_PASSWORD: z.string().default(''),

  LARAVEL_INTERNAL_API_URL: z.string().url('LARAVEL_INTERNAL_API_URL must be a valid URL'),
  INTERNAL_SHARED_SECRET: z.string().min(1, 'INTERNAL_SHARED_SECRET is required'),

  SOCKET_CORS_ORIGIN: z.string().min(1, 'SOCKET_CORS_ORIGIN is required'),
  WHATSAPP_SESSION_DIR: z.string().min(1, 'WHATSAPP_SESSION_DIR is required'),
  INTERNAL_GATEWAY_TOKEN: z.string().min(1, 'INTERNAL_GATEWAY_TOKEN is required'),

  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),

  WHATSAPP_WORKSPACE_ID: z.coerce.number().int().positive().default(1),

  // How many WhatsApp accounts may restore (credential read + WS connect)
  // concurrently on gateway boot. Bounded to avoid a thundering herd when a
  // workspace holds many connections (Phase 6.5).
  STARTUP_RESTORE_CONCURRENCY: z.coerce.number().int().positive().default(3),

  // Phase 6.2/6.3 - per-account reconnect policy. Exposed as configuration so
  // operators tune the storm-protection curve per deployment instead of
  // editing magic constants inside the lifecycle code:
  //   delay = min(base * 2^(attempt-1), max) + random jitter
  // The jitter is what stops 100 accounts that disconnected together from all
  // reconnecting in the same tick.
  WHATSAPP_RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(2_000),

  // Hard ceiling for the reconnect backoff so a long outage never produces an
  // unbounded wait. Attempts beyond WHATSAPP_RECONNECT_MAX_ATTEMPTS stop
  // automatic reconnection until an operator acts (Phase 6.3).
  WHATSAPP_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().positive().default(5 * 60_000),
  WHATSAPP_RECONNECT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  WHATSAPP_RECONNECT_JITTER_RATIO: z.coerce.number().min(0).max(1).default(0.2),

  // Phase 6.2 - Baileys' restartRequired signal is a routine "reconnect me now"
  // (e.g. right after pairing), not a failure. It bypasses the backoff curve and
  // reconnects after this short pause so we never wait out an exponential delay
  // for something WhatsApp explicitly asked to be restarted.
  WHATSAPP_RESTART_REQUIRED_DELAY_MS: z.coerce.number().int().nonnegative().default(250),

  // Phase 6.4 - how long a generated QR payload stays valid for one account.
  // Each account owns its own QR/TTL (the account context exposes qrExpiresAt
  // per account), so this is a policy value, not a shared clock.
  WHATSAPP_QR_TTL_MS: z.coerce.number().int().positive().default(60_000),

  SESSION_LOCK_ENABLED: z
    .string()
    .transform((v) => ['1', 'true', 'yes'].includes(v.toLowerCase()))
    .default('false'),
  GATEWAY_INSTANCE_ID: z.string().default(() => `${os.hostname()}:${process.env.PORT ?? '3000'}`),
  SESSION_LEASE_MS: z.coerce.number().int().positive().default(30_000),
  SESSION_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  WHATSAPP_KEEPALIVE_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  WHATSAPP_COUNTRY_CODE: z.string().default('94'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  MEDIA_MAX_SIZE_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  MEDIA_ALLOWED_MIME_TYPES: z
    .string()
    .default(
      'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,audio/ogg,audio/mpeg,audio/mp4,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ),

  MEDIA_LOCAL_STORAGE_DIR: z.string().default('./media-storage'),

  STORAGE_PROVIDER: z.enum(['local', 'azure']).default('local'),

  // Azure Blob Storage (required when STORAGE_PROVIDER=azure). Auth via
  // AZURE_STORAGE_CONNECTION_STRING when present, else account key
  // (AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY). AZURE_STORAGE_URL
  // is the account base URL, e.g. https://<account>.blob.core.windows.net.
  AZURE_STORAGE_CONNECTION_STRING: z.string().default(''),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().default(''),
  AZURE_STORAGE_ACCOUNT_KEY: z.string().default(''),
  AZURE_STORAGE_CONTAINER_NAME: z.string().default(''),
  AZURE_STORAGE_URL: z.string().default(''),

  SEND_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1),
  SEND_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().default(1000),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // eslint-disable-next-line no-console
    console.error(
      `Invalid environment configuration. Fix the following and restart:\n${formatted}`,
    );
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();