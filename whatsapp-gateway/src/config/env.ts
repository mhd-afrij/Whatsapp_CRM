import dotenv from 'dotenv';
import os from 'node:os';
import { z } from 'zod';

dotenv.config();

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

  // Optional MinIO/S3-compatible object storage. If S3_BUCKET is unset, the
  // gateway falls back to local-disk storage (see src/lib/storage.ts).
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

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