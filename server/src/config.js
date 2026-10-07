import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BIND_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine(
      (value) => !value.startsWith('replace-with-'),
      'Run npm run setup to generate a signing secret.',
    ),
  SESSION_HOURS: z.coerce.number().min(0.25).max(24).default(8),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

export function loadConfig(environment = process.env) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    // Do not print environment values (which may contain secrets).
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}. See .env.example.`,
    );
  }
  const env = parsed.data;
  const origin = new URL(env.APP_ORIGIN);
  if (origin.origin !== env.APP_ORIGIN)
    throw new Error('APP_ORIGIN must be an origin without a trailing slash or path.');
  if (env.NODE_ENV === 'production' && origin.protocol !== 'https:')
    throw new Error('Production APP_ORIGIN must use HTTPS.');
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.BIND_HOST,
    origin: env.APP_ORIGIN,
    mongoUri: env.MONGODB_URI,
    jwtSecret: env.JWT_SECRET,
    sessionHours: env.SESSION_HOURS,
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
