import type { UserRole } from '@coldlink/shared';
import type { Request, RequestHandler } from 'express';
import {
  InvalidAccessTokenError,
  type AccessTokenClaims,
  type AccessTokens,
} from '../auth/tokens.js';
import { findUserById, type User } from '../auth/users.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';

declare global {
  // Express's own Request interface, extended through declaration merging.
  // oxlint-disable-next-line typescript/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      user?: User;
    }
  }
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

export interface AuthDependencies {
  db: Database;
  tokens: AccessTokens;
}

async function verifyOrUndefined(
  tokens: AccessTokens,
  token: string,
): Promise<AccessTokenClaims | undefined> {
  try {
    return await tokens.verify(token);
  } catch (error) {
    if (error instanceof InvalidAccessTokenError) return undefined;
    throw error;
  }
}

function unauthorized(message: string): AppError {
  return new AppError('unauthorized', message);
}

/**
 * Verifies the bearer access token and attaches its user, read fresh from the database so that
 * deactivating a user or changing their roles takes effect at once, not when the token expires.
 */
export function requireAuth({ db, tokens }: AuthDependencies): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.get('Authorization') ?? '')?.[1];
    const claims = token === undefined ? undefined : await verifyOrUndefined(tokens, token);
    const user = claims === undefined ? undefined : await findUserById(db, claims.sub);
    if (user === undefined || !user.is_active) {
      res.set('WWW-Authenticate', 'Bearer');
      next(
        unauthorized(
          token === undefined ? 'Sign in to continue.' : 'Your session has ended. Sign in again.',
        ),
      );
      return;
    }
    req.user = user;
    next();
  };
}

/** Lets the request through if the signed-in user has any of the roles. Use after requireAuth. */
export function requireRole(...roles: [UserRole, ...UserRole[]]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (user === undefined) {
      next(unauthorized('Sign in to continue.'));
      return;
    }
    if (!user.roles.some((role) => roles.includes(role))) {
      next(new AppError('forbidden', "You don't have access to this."));
      return;
    }
    next();
  };
}

/** The user requireAuth attached; throws if the route forgot requireAuth. */
export function signedInUser(req: Request): User {
  if (req.user === undefined) throw new Error('requireAuth must run before this handler');
  return req.user;
}
