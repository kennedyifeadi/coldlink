import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createAccessTokens,
  generateRefreshToken,
  hashRefreshToken,
  InvalidAccessTokenError,
  type AccessTokenClaims,
} from './tokens.js';

const secret = 'jwt-secret-for-tests-0123456789abcdef';
const claims: AccessTokenClaims = {
  sub: '6f2c1a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  roles: ['farmer', 'provider'],
  cid: '4820193',
};
const issuedAt = new Date('2026-11-06T12:00:00Z');

function at(secondsLater: number) {
  return () => new Date(issuedAt.getTime() + secondsLater * 1000);
}

describe('access tokens', () => {
  it('round-trips the claims', async () => {
    const tokens = createAccessTokens(secret, { now: at(0) });
    const token = await tokens.sign(claims);
    await expect(tokens.verify(token)).resolves.toEqual(claims);
  });

  it('carries the claims, an expiry 15 minutes out, and nothing else of note', async () => {
    const token = await createAccessTokens(secret, { now: at(0) }).sign(claims);
    const [, payload = ''] = token.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      ...claims,
      iss: 'coldlink-api',
      aud: 'coldlink',
      iat: issuedAt.getTime() / 1000,
      exp: issuedAt.getTime() / 1000 + 900,
    });
  });

  it('is valid until 15 minutes after it was issued, and not after', async () => {
    const token = await createAccessTokens(secret, { now: at(0) }).sign(claims);
    await expect(createAccessTokens(secret, { now: at(899) }).verify(token)).resolves.toEqual(
      claims,
    );
    await expect(createAccessTokens(secret, { now: at(900) }).verify(token)).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const token = await createAccessTokens(`${secret}-other`).sign(claims);
    await expect(createAccessTokens(secret).verify(token)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects a token whose payload was changed', async () => {
    const tokens = createAccessTokens(secret);
    const [header, , signature] = (await tokens.sign(claims)).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, roles: ['admin'] })).toString(
      'base64url',
    );
    await expect(tokens.verify(`${header}.${forged}.${signature}`)).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rejects an unsigned token', async () => {
    const token = new UnsecuredJWT({ roles: ['admin'], cid: claims.cid })
      .setSubject(claims.sub)
      .setIssuer('coldlink-api')
      .setAudience('coldlink')
      .setIssuedAt()
      .setExpirationTime('15m')
      .encode();
    await expect(createAccessTokens(secret).verify(token)).rejects.toThrow(InvalidAccessTokenError);
  });

  it.each([
    ['another audience', { aud: 'other', roles: claims.roles, cid: claims.cid }],
    ['an unknown role', { aud: 'coldlink', roles: ['superuser'], cid: claims.cid }],
    ['no roles', { aud: 'coldlink', roles: [], cid: claims.cid }],
    ['a malformed ColdLink ID', { aud: 'coldlink', roles: claims.roles, cid: '12' }],
  ])('rejects a correctly signed token with %s', async (_case, { aud, ...payload }) => {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer('coldlink-api')
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(secret));
    await expect(createAccessTokens(secret).verify(token)).rejects.toThrow(InvalidAccessTokenError);
  });

  it('rejects text that is not a token', async () => {
    await expect(createAccessTokens(secret).verify('not-a-jwt')).rejects.toThrow(
      InvalidAccessTokenError,
    );
  });
});

describe('refresh tokens', () => {
  it('are 32 random bytes, different every time', () => {
    const tokens = Array.from({ length: 50 }, generateRefreshToken);
    expect(tokens.every((token) => /^[A-Za-z0-9_-]{43}$/.test(token))).toBe(true);
    expect(new Set(tokens).size).toBe(50);
  });

  it('are stored as a SHA-256 hex digest', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(hashRefreshToken(generateRefreshToken()));
  });
});
