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

describe('loadConfig', () => {
  it('reads and converts valid variables', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        CORS_ORIGINS: 'https://coldlink.ng, https://admin.coldlink.ng',
      }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      corsOrigins: ['https://coldlink.ng', 'https://admin.coldlink.ng'],
    });
  });

  it('defaults to local development', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      corsOrigins: ['http://localhost:5173'],
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
    ]);
    expect(error.message).toMatch(/^Invalid environment configuration:\n {2}- NODE_ENV: /);
  });

  it('requires CORS_ORIGINS in production', () => {
    expect(configError({ NODE_ENV: 'production' }).issues).toEqual([
      'CORS_ORIGINS: Required in production',
    ]);
  });

  it('reports a missing production CORS_ORIGINS alongside other invalid variables', () => {
    expect(configError({ NODE_ENV: 'production', PORT: 'abc' }).issues).toEqual([
      expect.stringMatching(/^PORT: /),
      'CORS_ORIGINS: Required in production',
    ]);
  });

  it.each(['', ' , ', 'https://coldlink.ng/', 'https://coldlink.ng/app', 'coldlink.ng'])(
    'rejects CORS_ORIGINS=%j',
    (origins) => {
      expect(configError({ CORS_ORIGINS: origins }).issues[0]).toMatch(/^CORS_ORIGINS/);
    },
  );

  it.each(['0', '65536', '3000.5'])('rejects PORT=%s', (port) => {
    expect(configError({ PORT: port }).issues[0]).toMatch(/^PORT: /);
  });
});
