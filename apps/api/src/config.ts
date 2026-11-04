import * as z from 'zod';

const DEV_WEB_ORIGIN = 'http://localhost:5173';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalDatabaseHost(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname);
}

// Messages never echo the URL: it holds the database password.
const databaseUrlSchema = z
  .string()
  .refine((value) => URL.canParse(value) && /^postgres(ql)?:$/.test(new URL(value).protocol), {
    message: 'Must be a postgres:// or postgresql:// URL',
    abort: true,
  })
  .refine(
    (value) => {
      const url = new URL(value);
      return url.searchParams.get('sslmode') !== 'disable' || isLocalDatabaseHost(url);
    },
    { message: 'sslmode=disable is only allowed for a database on localhost' },
  );

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
  DATABASE_URL: databaseUrlSchema,
  DATABASE_SSL_ROOT_CERT: z.string().min(1).optional(),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsOrigins: string[];
  databaseUrl: string;
  /** Path to the CA certificate that signs the database server's certificate. */
  databaseSslRootCert: string | undefined;
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
  if (env['NODE_ENV'] === 'production' && env['DATABASE_SSL_ROOT_CERT'] === undefined) {
    issues.push('DATABASE_SSL_ROOT_CERT: Required in production');
  }
  if (!result.success || issues.length > 0) {
    throw new ConfigError(issues);
  }
  const { NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS, DATABASE_URL, DATABASE_SSL_ROOT_CERT } =
    result.data;
  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    logLevel: LOG_LEVEL,
    // Outside production an unset allowlist means the local Vite dev server.
    corsOrigins: CORS_ORIGINS ?? [DEV_WEB_ORIGIN],
    databaseUrl: DATABASE_URL,
    databaseSslRootCert: DATABASE_SSL_ROOT_CERT,
  };
}
