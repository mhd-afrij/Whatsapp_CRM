import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SYNC_PORT: z.coerce.number().int().positive().default(3100),

  MYSQL_HOST: z.string().default("localhost"),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z.string().default("whatsapp_crm"),
  MYSQL_USER: z.string().default("whatsapp_crm"),
  MYSQL_PASSWORD: z.string().default(""),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(""),

  SESSION_ENCRYPTION_KEY: z.string().optional(),
  SERVICE_TO_SERVICE_SECRET: z.string().optional(),
  SYNC_STATE_PATH: z.string().default("storage/sync-session.json"),
  STRICT_MYSQL_ONLY: z.coerce.boolean().default(false),
  WHATSAPP_AUTH_DIR: z.string().default("storage/wa-auth"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LARAVEL_API_BASE_URL: z.string().default("http://localhost:8000/api/v1"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
