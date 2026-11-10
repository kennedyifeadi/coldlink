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

// 32 random bytes, as base64url: node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
const secretSchema = z.string().min(32, 'Must be at least 32 characters of random data');

export const sameSiteValues = ['strict', 'lax', 'none'] as const;

export const smsProviders = ['console', 'termii'] as const;
// dnd reaches Nigerian numbers on Do-Not-Disturb; generic does not (Termii's SMS API docs).
export const termiiChannels = ['dnd', 'generic'] as const;

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
  SMS_PROVIDER: z.enum(smsProviders).default('console'),
  TERMII_API_KEY: z.string().min(1).optional(),
  TERMII_SENDER_ID: z
    .string()
    .regex(/^[A-Za-z0-9]{3,11}$/, 'Must be 3 to 11 letters or digits')
    .optional(),
  // Each Termii account has its own base URL, shown on its dashboard.
  TERMII_BASE_URL: originSchema
    .refine((value) => value.startsWith('https://'), { message: 'Must use https' })
    .optional(),
  TERMII_CHANNEL: z.enum(termiiChannels).default('dnd'),
  JWT_SECRET: secretSchema,
  OTP_PEPPER: secretSchema,
  // strict when the web app and the API share a site (localhost, or api.coldlink.ng beside
  // coldlink.ng); none only when they are on different sites (decision 60).
  AUTH_COOKIE_SAME_SITE: z.enum(sameSiteValues).default('strict'),
  // Proxies in front of the API whose X-Forwarded-For is trusted for the client IP: 1 on Render or
  // Railway, 0 when clients connect directly.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Facility photos (PRD 10). The service-role key bypasses RLS, so it stays on the server.
  SUPABASE_URL: originSchema.optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export interface TermiiConfig {
  apiKey: string;
  senderId: string;
  baseUrl: string;
  channel: (typeof termiiChannels)[number];
}

export type SmsConfig = { provider: 'console' } | { provider: 'termii'; termii: TermiiConfig };

export interface StorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface AuthConfig {
  /** Signs access tokens (HS256). */
  jwtSecret: string;
  /** Key for the HMAC that otp_codes stores in place of each code. */
  otpPepper: string;
  cookieSameSite: (typeof sameSiteValues)[number];
  /** Returns each OTP in the request response; only in local development (decision 57). */
  devOtp: boolean;
}

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  corsOrigins: string[];
  databaseUrl: string;
  /** Path to the CA certificate that signs the database server's certificate. */
  databaseSslRootCert: string | undefined;
  sms: SmsConfig;
  auth: AuthConfig;
  trustProxyHops: number;
  /** Unset outside production when the Supabase settings are, as in CI. */
  storage: StorageConfig | undefined;
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
  issues.push(...smsIssues(env), ...storageIssues(env));
  if (env['JWT_SECRET'] !== undefined && env['JWT_SECRET'] === env['OTP_PEPPER']) {
    issues.push('OTP_PEPPER: Must differ from JWT_SECRET');
  }
  if (!result.success || issues.length > 0) {
    throw new ConfigError(issues);
  }
  const { NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS, DATABASE_URL, DATABASE_SSL_ROOT_CERT } =
    result.data;
  const sms = smsConfig(result.data);
  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    logLevel: LOG_LEVEL,
    // Outside production an unset allowlist means the local Vite dev server.
    corsOrigins: CORS_ORIGINS ?? [DEV_WEB_ORIGIN],
    databaseUrl: DATABASE_URL,
    databaseSslRootCert: DATABASE_SSL_ROOT_CERT,
    sms,
    auth: {
      jwtSecret: result.data.JWT_SECRET,
      otpPepper: result.data.OTP_PEPPER,
      cookieSameSite: result.data.AUTH_COOKIE_SAME_SITE,
      devOtp: isDevOtpAllowed(NODE_ENV, sms),
    },
    trustProxyHops: result.data.TRUST_PROXY_HOPS,
    storage: storageConfig(result.data),
  };
}

/**
 * The dev OTP needs both: development, so it is never on in production or tests, and the console
 * provider, so it is never on while real SMS go out.
 */
export function isDevOtpAllowed(nodeEnv: Config['nodeEnv'], sms: SmsConfig): boolean {
  return nodeEnv === 'development' && sms.provider === 'console';
}

function smsIssues(env: NodeJS.ProcessEnv): string[] {
  const provider = env['SMS_PROVIDER'] ?? 'console';
  if (env['NODE_ENV'] === 'production' && provider === 'console') {
    return ['SMS_PROVIDER: Must be termii in production, where the console provider sends nothing'];
  }
  if (provider !== 'termii') return [];
  return (['TERMII_API_KEY', 'TERMII_SENDER_ID', 'TERMII_BASE_URL'] as const)
    .filter((name) => env[name] === undefined)
    .map((name) => `${name}: Required when SMS_PROVIDER is termii`);
}

const storageVariables = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

function storageIssues(env: NodeJS.ProcessEnv): string[] {
  const missing = storageVariables.filter((name) => env[name] === undefined);
  if (env['NODE_ENV'] === 'production') {
    return missing.map((name) => `${name}: Required in production`);
  }
  if (missing.length === 1) {
    const set = storageVariables.find((name) => !missing.includes(name));
    return [`${missing[0]}: Required when ${set} is set`];
  }
  return [];
}

function storageConfig(env: z.infer<typeof envSchema>): StorageConfig | undefined {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (SUPABASE_URL === undefined || SUPABASE_SERVICE_ROLE_KEY === undefined) return undefined;
  return { supabaseUrl: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY };
}

function smsConfig(env: z.infer<typeof envSchema>): SmsConfig {
  const { SMS_PROVIDER, TERMII_API_KEY, TERMII_SENDER_ID, TERMII_BASE_URL, TERMII_CHANNEL } = env;
  if (SMS_PROVIDER === 'console') return { provider: 'console' };
  // smsIssues has already rejected a termii config with any of these missing.
  if (
    TERMII_API_KEY === undefined ||
    TERMII_SENDER_ID === undefined ||
    TERMII_BASE_URL === undefined
  ) {
    throw new ConfigError(['SMS_PROVIDER: termii is missing its settings']);
  }
  return {
    provider: 'termii',
    termii: {
      apiKey: TERMII_API_KEY,
      senderId: TERMII_SENDER_ID,
      baseUrl: TERMII_BASE_URL,
      channel: TERMII_CHANNEL,
    },
  };
}
