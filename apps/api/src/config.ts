import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  MONGODB_URI: z.string().url().startsWith('mongodb'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(5).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_DOMAIN: z
    .string()
    .startsWith('.', 'COOKIE_DOMAIN debe empezar con "." (ej: .bvcross.app)')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  APP_ORIGINS: z
    .string()
    .default('')
    .transform((csv) => csv.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().url())),
  EMAIL_FROM: z.string().email().default('no-reply@bvcross.local'),
  RESEND_API_KEY: z
    .string()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  TRUST_PROXY: boolFromString.default('false'),
});

export type Config = z.infer<typeof configSchema> & {
  isProd: boolean;
  isTest: boolean;
};

export class ConfigError extends Error {}

/**
 * Valida el entorno al boot (fail-fast, docs/05-seguridad.md §6).
 * Lanza ConfigError con el detalle de cada variable inválida/faltante.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(`Configuración inválida:\n${detail}`);
  }
  const config = parsed.data;
  return {
    ...config,
    isProd: config.NODE_ENV === 'production',
    isTest: config.NODE_ENV === 'test',
  };
}
