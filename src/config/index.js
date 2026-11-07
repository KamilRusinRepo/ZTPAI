import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const booleanEnv = z.enum(['true', 'false']).default('false').transform((value) => value === 'true');
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  REPOSITORY_DRIVER: z.enum(['knex', 'memory']).default('knex'),
  DATABASE_URL: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname && url.pathname.length > 1;
    } catch { return false; }
  }, 'DATABASE_URL must be a PostgreSQL URL with a host and database name'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must have at least 32 characters'),
  JWT_EXPIRES_IN: z.string().regex(/^[1-9]\d*(s|m|h|d)$/, 'JWT_EXPIRES_IN must be a positive duration, e.g. 15m or 10s')
    .refine((value) => {
      const match = /^([1-9]\d*)(s|m|h|d)$/.exec(value);
      return !!match && Number.isSafeInteger(Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]]));
    }, 'JWT_EXPIRES_IN is too large').default('15m'),
  ENABLE_DEBUG_ROUTES: booleanEnv,
  SEED_STARTED_RESERVATION: booleanEnv,
  BASE_URL: z.url().refine((value) => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); }
    catch { return false; }
  }, 'BASE_URL must use HTTP or HTTPS').default('http://localhost:3000'),
  ACCESS_TOKEN: z.string().min(1).optional(),
});

export function parseConfig(env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Only field names and messages are printed; secret values are never included.
    throw new Error('Invalid environment configuration:\n' + result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n'));
  }
  const value = result.data;
  return Object.freeze({ nodeEnv: value.NODE_ENV, port: value.PORT, repositoryDriver: value.REPOSITORY_DRIVER,
    databaseUrl: value.DATABASE_URL, jwtSecret: value.JWT_SECRET, jwtExpiresIn: value.JWT_EXPIRES_IN,
    enableDebugRoutes: value.ENABLE_DEBUG_ROUTES, seedStartedReservation: value.SEED_STARTED_RESERVATION,
    baseUrl: value.BASE_URL, accessToken: value.ACCESS_TOKEN });
}

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Cannot load .env: ' + error.code);
}

export function runtimeEnvironment(overrides = {}) {
  return { ...process.env, ...overrides };
}

const demo = process.argv.includes('--seed-demo')
  ? { REPOSITORY_DRIVER: 'memory', SEED_STARTED_RESERVATION: 'true' } : {};
const config = parseConfig(runtimeEnvironment(demo));
export default config;
