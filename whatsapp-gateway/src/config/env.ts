import dotenv from 'dotenv';
import os from 'node:os';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // PostgreSQL / Supabase Database Configuration
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_DATABASE: z.string().default('postgres'),
  DB_USERNAME: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),

  LARAVEL_INTERNAL_API_URL: z.string().url('LARAVEL_INTERNAL_API_URL must be a valid URL'),
  INTERNAL_SHARED_SECRET: z.string().min(1, 'INTERNAL_SHARED_SECRET is required'),

  SOCKET_CORS_ORIGIN: z.string().min(1, 'SOCKET_CORS_ORIGIN is required'),
  WHATSAPP_SESSION_DIR: z.string().min(1, 'WHATSAPP_SESSION_DIR is required'),
  INTERNAL_GATEWAY_TOKEN: z.string().min(1, 'INTERNAL_GATEWAY_TOKEN is required'),

  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),

  WHATSAPP_WORKSPACE_ID: z.coerce.number().int().positive().default(1),

  STARTUP_RESTORE_CONCURRENCY: z.coerce.number().int().positive().default(3),

  WHATSAPP_RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(2_000),
  WHATSAPP_RECONNECT_MAX_DELAY_MS: z.coerce.number().int().positive().default(5 * 60_000),
  WHATSAPP_RECONNECT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  WHATSAPP_RECONNECT_JITTER_RATIO: z.coerce.number().min(0).max(1).default(0.2),
  WHATSAPP_RESTART_REQUIRED_DELAY_MS: z.coerce.number().int().nonnegative().default(250),
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

  // Supabase Storage Configuration
  STORAGE_PROVIDER: z.literal('supabase').default('supabase'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('whatsapp-media'),

  SEND_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1),
  SEND_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().default(1000),
})
  .superRefine((value, ctx) => {
    // Database requirement check
    if (process.env.NODE_ENV !== 'test') {
      if (!value.DATABASE_URL && !value.DB_HOST && !process.env.PGHOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DB_HOST'],
          message: 'Either DATABASE_URL or DB_HOST (PGHOST) is required to connect to PostgreSQL / Supabase',
        });
      }
    }

    // Storage requirement check
    if (value.STORAGE_PROVIDER === 'supabase') {
      if (!value.SUPABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_URL'],
          message: 'SUPABASE_URL is required when STORAGE_PROVIDER=supabase',
        });
      }
      if (!value.SUPABASE_SERVICE_ROLE_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_SERVICE_ROLE_KEY'],
          message: 'SUPABASE_SERVICE_ROLE_KEY is required when STORAGE_PROVIDER=supabase',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export const storageEnvSchema = envSchema;

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
