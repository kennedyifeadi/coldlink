import { describe, expect, it } from 'vitest';
import { ConfigError, isDevOtpAllowed, loadConfig } from './config.js';

function configError(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('Expected loadConfig to throw');
}

const DATABASE_URL = 'postgresql://coldlink:s3cret@db.example.test:5432/postgres';
const JWT_SECRET = 'jwt-secret-for-tests-0123456789abcdef';
const OTP_PEPPER = 'otp-pepper-for-tests-0123456789abcdef';
const required = { DATABASE_URL, JWT_SECRET, OTP_PEPPER };
const termii = {
  SMS_PROVIDER: 'termii',
  TERMII_API_KEY: 'termii-key-123',
  TERMII_SENDER_ID: 'ColdLink',
  TERMII_BASE_URL: 'https://v3.api.termii.com',
};
const productionSms =
  'SMS_PROVIDER: Must be termii in production, where the console provider sends nothing';

describe('loadConfig', () => {
  it('reads and converts valid variables', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        CORS_ORIGINS: 'https://coldlink.ng, https://admin.coldlink.ng',
        DATABASE_URL,
        DATABASE_SSL_ROOT_CERT: 'certs/supabase-ca.crt',
        JWT_SECRET,
        OTP_PEPPER,
        AUTH_COOKIE_SAME_SITE: 'none',
        TRUST_PROXY_HOPS: '1',
        ...termii,
      }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      corsOrigins: ['https://coldlink.ng', 'https://admin.coldlink.ng'],
      databaseUrl: DATABASE_URL,
      databaseSslRootCert: 'certs/supabase-ca.crt',
      sms: {
        provider: 'termii',
        termii: {
          apiKey: 'termii-key-123',
          senderId: 'ColdLink',
          baseUrl: 'https://v3.api.termii.com',
          channel: 'dnd',
        },
      },
      auth: { jwtSecret: JWT_SECRET, otpPepper: OTP_PEPPER, cookieSameSite: 'none', devOtp: false },
      trustProxyHops: 1,
    });
  });

  it('defaults to local development', () => {
    expect(loadConfig(required)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      corsOrigins: ['http://localhost:5173'],
      databaseUrl: DATABASE_URL,
      databaseSslRootCert: undefined,
      sms: { provider: 'console' },
      auth: {
        jwtSecret: JWT_SECRET,
        otpPepper: OTP_PEPPER,
        cookieSameSite: 'strict',
        devOtp: true,
      },
      trustProxyHops: 0,
    });
  });

  it('lists every invalid variable in one error', () => {
    const error = configError({
      NODE_ENV: 'staging',
      PORT: 'eighty',
      LOG_LEVEL: 'loud',
      CORS_ORIGINS: '*',
    });
    expect(error.issues.map((issue) => issue.split(':')[0])).toEqual([
      'NODE_ENV',
      'PORT',
      'LOG_LEVEL',
      'CORS_ORIGINS.0',
      'DATABASE_URL',
      'JWT_SECRET',
      'OTP_PEPPER',
    ]);
    expect(error.message).toMatch(/^Invalid environment configuration:\n {2}- NODE_ENV: /);
  });

  it('requires CORS_ORIGINS and DATABASE_SSL_ROOT_CERT in production', () => {
    expect(configError({ ...required, NODE_ENV: 'production' }).issues).toEqual([
      'CORS_ORIGINS: Required in production',
      'DATABASE_SSL_ROOT_CERT: Required in production',
      productionSms,
    ]);
  });

  it('reports a missing production CORS_ORIGINS alongside other invalid variables', () => {
    expect(
      configError({
        NODE_ENV: 'production',
        PORT: 'abc',
        DATABASE_SSL_ROOT_CERT: 'ca.crt',
        ...termii,
      }).issues,
    ).toEqual([
      expect.stringMatching(/^PORT: /),
      expect.stringMatching(/^DATABASE_URL: /),
      expect.stringMatching(/^JWT_SECRET: /),
      expect.stringMatching(/^OTP_PEPPER: /),
      'CORS_ORIGINS: Required in production',
    ]);
  });

  it.each(['', ' , ', 'https://coldlink.ng/', 'https://coldlink.ng/app', 'coldlink.ng'])(
    'rejects CORS_ORIGINS=%j',
    (origins) => {
      expect(configError({ ...required, CORS_ORIGINS: origins }).issues[0]).toMatch(
        /^CORS_ORIGINS/,
      );
    },
  );

  it.each(['0', '65536', '3000.5'])('rejects PORT=%s', (port) => {
    expect(configError({ ...required, PORT: port }).issues[0]).toMatch(/^PORT: /);
  });

  it.each([
    'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable',
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable',
    'postgres://postgres:postgres@[::1]:5432/postgres?sslmode=disable',
  ])('allows a plain connection to a local database: %s', (url) => {
    expect(loadConfig({ ...required, DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it.each([
    ['', 'Must be a postgres:// or postgresql:// URL'],
    ['not a url', 'Must be a postgres:// or postgresql:// URL'],
    [
      'mysql://coldlink:s3cret@db.example.test/coldlink',
      'Must be a postgres:// or postgresql:// URL',
    ],
    [
      `${DATABASE_URL}?sslmode=disable`,
      'sslmode=disable is only allowed for a database on localhost',
    ],
  ])('rejects DATABASE_URL=%j without echoing it', (url, message) => {
    const error = configError({ ...required, DATABASE_URL: url });
    expect(error.issues).toEqual([`DATABASE_URL: ${message}`]);
    expect(error.message).not.toContain('s3cret');
  });

  it('accepts the generic Termii channel', () => {
    const { sms } = loadConfig({ ...required, ...termii, TERMII_CHANNEL: 'generic' });
    expect(sms.provider === 'termii' && sms.termii.channel).toBe('generic');
  });

  it('requires every Termii setting when SMS_PROVIDER is termii', () => {
    expect(configError({ ...required, SMS_PROVIDER: 'termii' }).issues).toEqual([
      'TERMII_API_KEY: Required when SMS_PROVIDER is termii',
      'TERMII_SENDER_ID: Required when SMS_PROVIDER is termii',
      'TERMII_BASE_URL: Required when SMS_PROVIDER is termii',
    ]);
  });

  it.each([
    ['SMS_PROVIDER', 'twilio'],
    ['TERMII_SENDER_ID', 'CL'],
    ['TERMII_SENDER_ID', 'ColdLinkNigeria'],
    ['TERMII_SENDER_ID', 'Cold-Link'],
    ['TERMII_BASE_URL', 'http://v3.api.termii.com'],
    ['TERMII_BASE_URL', 'https://v3.api.termii.com/api'],
    ['TERMII_CHANNEL', 'whatsapp'],
    ['TERMII_API_KEY', ''],
  ])('rejects %s=%j', (name, value) => {
    expect(configError({ ...required, ...termii, [name]: value }).issues).toEqual([
      expect.stringMatching(new RegExp(`^${name}: `)),
    ]);
  });

  it.each([
    ['JWT_SECRET', 'short'],
    ['OTP_PEPPER', 'short'],
    ['AUTH_COOKIE_SAME_SITE', 'relaxed'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['TRUST_PROXY_HOPS', 'true'],
  ])('rejects %s=%j', (name, value) => {
    expect(configError({ ...required, [name]: value }).issues).toEqual([
      expect.stringMatching(new RegExp(`^${name}: `)),
    ]);
  });

  it('requires JWT_SECRET and OTP_PEPPER without echoing them', () => {
    expect(configError({ DATABASE_URL }).issues).toEqual([
      expect.stringMatching(/^JWT_SECRET: /),
      expect.stringMatching(/^OTP_PEPPER: /),
    ]);
    const error = configError({ ...required, JWT_SECRET: 'too-short-secret' });
    expect(error.message).not.toContain('too-short-secret');
  });

  it('refuses the same value for JWT_SECRET and OTP_PEPPER', () => {
    expect(configError({ ...required, OTP_PEPPER: JWT_SECRET }).issues).toEqual([
      'OTP_PEPPER: Must differ from JWT_SECRET',
    ]);
  });
});

describe('dev OTP guard', () => {
  it('is on only in development with the console SMS provider', () => {
    expect(loadConfig({ ...required, NODE_ENV: 'development' }).auth.devOtp).toBe(true);
    expect(loadConfig({ ...required, NODE_ENV: 'test' }).auth.devOtp).toBe(false);
    expect(loadConfig({ ...required, NODE_ENV: 'development', ...termii }).auth.devOtp).toBe(false);
  });

  it('is never on in production, whatever else is set', () => {
    const production = {
      ...required,
      ...termii,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://coldlink.ng',
      DATABASE_SSL_ROOT_CERT: 'ca.crt',
    };
    expect(loadConfig(production).auth.devOtp).toBe(false);
    expect(loadConfig({ ...production, DEV_OTP: 'true', SMS_DEV_OTP: '1' }).auth.devOtp).toBe(
      false,
    );
    // Production with the console provider, the one other way to meet the guard, cannot start.
    expect(configError({ ...production, SMS_PROVIDER: 'console' }).issues).toEqual([productionSms]);
  });

  it.each(['production', 'test'] as const)('is off in %s even with the console provider', (env) => {
    expect(isDevOtpAllowed(env, { provider: 'console' })).toBe(false);
  });
});
