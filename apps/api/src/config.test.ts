import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

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
const required = { DATABASE_URL };
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
    expect(loadConfig({ DATABASE_URL: url }).databaseUrl).toBe(url);
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
    const error = configError({ DATABASE_URL: url });
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
});
