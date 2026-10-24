import * as z from 'zod';

const DEV_WEB_ORIGIN = 'http://localhost:5173';

const originSchema = z
  .string()
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
    message: 'Must be an origin such as https://coldlink.ng, with no path or trailing slash',
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    )
    .pipe(z.array(originSchema).min(1, 'List at least one origin').optional()),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsOrigins: string[];
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  const issues = result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  // Checked outside the schema: Zod skips object-level refinements once any field fails, and
  // this must be reported alongside the other problems.
  if (env['NODE_ENV'] === 'production' && env['CORS_ORIGINS'] === undefined) {
    issues.push('CORS_ORIGINS: Required in production');
  }
  if (!result.success || issues.length > 0) {
    throw new ConfigError(issues);
  }
  const { NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS } = result.data;
  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    logLevel: LOG_LEVEL,
    // Outside production an unset allowlist means the local Vite dev server.
    corsOrigins: CORS_ORIGINS ?? [DEV_WEB_ORIGIN],
  };
}
