import { createHash, randomBytes } from 'node:crypto';
import { userRoleSchema, type UserRole } from '@coldlink/shared';
import { jwtVerify, SignJWT } from 'jose';
import * as z from 'zod';

// PRD 7.1: a 15-minute access token and a 30-day refresh token.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

const ALGORITHM = 'HS256';
const ISSUER = 'coldlink-api';
const AUDIENCE = 'coldlink';

export interface AccessTokenClaims {
  /** The user's id. */
  sub: string;
  roles: UserRole[];
  /** The user's 7-digit ColdLink ID, short enough to read out to support. */
  cid: string;
}

const claimsSchema = z.object({
  sub: z.uuid(),
  roles: z.array(userRoleSchema).min(1),
  cid: z.string().regex(/^\d{7}$/),
});

export class InvalidAccessTokenError extends Error {
  override readonly name = 'InvalidAccessTokenError';
}

export interface AccessTokens {
  sign(claims: AccessTokenClaims): Promise<string>;
  /** Resolves with the claims, or rejects with InvalidAccessTokenError. */
  verify(token: string): Promise<AccessTokenClaims>;
}

export interface AccessTokenOptions {
  /** The clock, for tests. */
  now?: () => Date;
}

export function createAccessTokens(
  secret: string,
  { now = () => new Date() }: AccessTokenOptions = {},
): AccessTokens {
  const key = new TextEncoder().encode(secret);
  return {
    sign({ sub, roles, cid }) {
      const issuedAt = Math.floor(now().getTime() / 1000);
      return new SignJWT({ roles, cid })
        .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
        .sign(key);
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          audience: AUDIENCE,
          currentDate: now(),
          requiredClaims: ['exp', 'iat', 'sub'],
        });
        return claimsSchema.parse(payload);
      } catch {
        // Which check failed is not the caller's business, and jose's messages can quote claims.
        throw new InvalidAccessTokenError('The access token is invalid or has expired');
      }
    },
  };
}

/** An opaque refresh token: 32 random bytes, which nothing but its hash needs to outlive. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Refresh tokens are random, so a plain SHA-256 is enough; no pepper or slow hash is needed. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
