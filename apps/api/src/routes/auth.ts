import {
  otpRequestBodySchema,
  otpVerifyBodySchema,
  type OtpRequestResponse,
  type SessionResponse,
} from '@coldlink/shared';
import cookieParser from 'cookie-parser';
import {
  Router,
  type CookieOptions,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import * as z from 'zod';
import type { AppConfigReader } from '../appConfig.js';
import { generateOtp, hashOtp, OTP_TTL_MINUTES } from '../auth/otp.js';
import { OTP_RESEND_COOLDOWN_SECONDS } from '../auth/otpLimits.js';
import { issueOtp } from '../auth/otpStore.js';
import { revokeFamily, revokeSession, rotateSession } from '../auth/sessions.js';
import { signInWithOtp } from '../auth/signIn.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
  type AccessTokens,
} from '../auth/tokens.js';
import { findUserById, toProfile, type User } from '../auth/users.js';
import type { BackgroundTasks } from '../backgroundTasks.js';
import type { AuthConfig } from '../config.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { rateLimit, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { sendNotification, type NotificationDeps } from '../notifications/send.js';
import type { smsTemplates } from '../notifications/templates.js';
import { API_BASE_PATH } from '../paths.js';

export const REFRESH_COOKIE = 'coldlink_refresh';
// Sent only to the auth routes, never with the rest of the API's traffic.
export const REFRESH_COOKIE_PATH = `${API_BASE_PATH}/auth`;

export interface AuthIpLimits {
  request: RateLimitOptions;
  verify: RateLimitOptions;
  /** Refresh and logout. */
  session: RateLimitOptions;
}

const FIFTEEN_MINUTES_MS = 15 * 60_000;

// Generous, because carrier-grade NAT puts many farmers on one mobile IP; the per-phone limits
// are the tight ones (decision 54).
export const defaultAuthIpLimits: AuthIpLimits = {
  request: { windowMs: FIFTEEN_MINUTES_MS, limit: 30 },
  verify: { windowMs: FIFTEEN_MINUTES_MS, limit: 60 },
  session: { windowMs: FIFTEEN_MINUTES_MS, limit: 120 },
};

export interface AuthRouteDependencies {
  db: Database;
  auth: AuthConfig;
  corsOrigins: string[];
  appConfig: AppConfigReader;
  tokens: AccessTokens;
  notifications: NotificationDeps<typeof smsTemplates>;
  tasks: BackgroundTasks;
  ipLimits: AuthIpLimits;
}

const refreshCookieSchema = z.object({ [REFRESH_COOKIE]: z.string().min(1).optional() });

function cookieOptions(auth: AuthConfig): CookieOptions {
  // Secure always: browsers treat http://localhost as secure, so local development still works.
  return { httpOnly: true, secure: true, sameSite: auth.cookieSameSite, path: REFRESH_COOKIE_PATH };
}

function readRefreshCookie(req: Request): string | undefined {
  const parsed = refreshCookieSchema.safeParse(req.cookies);
  return parsed.success ? parsed.data[REFRESH_COOKIE] : undefined;
}

/**
 * Cookie-authenticated routes refuse a browser request from a site outside the CORS allowlist, so
 * a SameSite=None cookie cannot be used from another site to sign someone out or churn their
 * token. Clients that send no Origin, such as the WhatsApp bot, are not browsers and pass.
 */
function requireAllowedOrigin(origins: string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('Origin');
    if (origin !== undefined && !origins.includes(origin)) {
      next(new AppError('forbidden', "You don't have access to this."));
      return;
    }
    next();
  };
}

function sessionEnded(): AppError {
  return new AppError('unauthorized', 'Your session has ended. Sign in again.');
}

function accountDisabled(): AppError {
  return new AppError('account_disabled', 'This account is turned off. Contact ColdLink support.');
}

export function authRoutes(deps: AuthRouteDependencies): Router {
  const { db, auth, tokens, tasks, ipLimits } = deps;
  const router = Router();
  const options = cookieOptions(auth);

  async function sendSession(res: Response, user: User, refreshToken: string, isNewUser: boolean) {
    const accessToken = await tokens.sign({
      sub: user.id,
      roles: user.roles,
      cid: user.coldlink_id,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...options,
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
    const body: SessionResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      is_new_user: isNewUser,
      user: toProfile(user),
    };
    res.set('Cache-Control', 'no-store').json(body);
  }

  router.post(
    '/auth/otp/request',
    rateLimit(ipLimits.request),
    validate({ body: otpRequestBodySchema }),
    async (req, res) => {
      const { phone } = req.body as z.output<typeof otpRequestBodySchema>;
      const code = generateOtp();
      const result = await issueOtp(db, phone, hashOtp(auth.otpPepper, phone, code));
      if (result.status === 'limited') {
        res.set('Retry-After', String(result.retryAfterSeconds));
        throw new AppError(
          'rate_limited',
          'Too many codes for this number. Wait a little, then try again.',
          { retry_after_seconds: result.retryAfterSeconds },
        );
      }
      // Termii can take up to 10 s, so the SMS goes after the response (decision 53). The user is
      // never looked up here, so the work and the answer are the same for any number (PRD 7.1).
      tasks.run(req.log, 'Sending the sign-in code failed', () =>
        sendNotification(deps.notifications, {
          template: 'otp',
          params: { code, expires_in_minutes: OTP_TTL_MINUTES },
          to: phone,
        }),
      );
      const body: OtpRequestResponse = {
        expires_in_seconds: OTP_TTL_MINUTES * 60,
        resend_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
        ...(auth.devOtp ? { dev_code: code } : {}),
      };
      res.set('Cache-Control', 'no-store').json(body);
    },
  );

  router.post(
    '/auth/otp/verify',
    rateLimit(ipLimits.verify),
    validate({ body: otpVerifyBodySchema }),
    async (req, res) => {
      const { phone, code, consent } = req.body as z.output<typeof otpVerifyBodySchema>;
      const { otp_required } = await deps.appConfig.get();
      const result = await signInWithOtp(db, {
        phone,
        code,
        consent: consent === true,
        otpPepper: auth.otpPepper,
        otpRequired: otp_required,
      });
      switch (result.status) {
        case 'invalid_code':
          throw new AppError(
            'otp_invalid',
            'That code is wrong or has expired. Check the SMS or ask for a new code.',
          );
        case 'consent_required':
          throw new AppError(
            'consent_required',
            'To create your account, agree to the ColdLink privacy notice.',
          );
        case 'account_disabled':
          throw accountDisabled();
        case 'signed_in':
          if (result.otpSkipped) {
            req.log.warn(
              { userId: result.user.id },
              'Account created without an OTP: otp_required is off',
            );
          }
          await sendSession(res, result.user, result.refreshToken, result.isNewUser);
      }
    },
  );

  router.post(
    '/auth/refresh',
    rateLimit(ipLimits.session),
    requireAllowedOrigin(deps.corsOrigins),
    cookieParser(),
    async (req, res) => {
      const token = readRefreshCookie(req);
      const result = token === undefined ? undefined : await rotateSession(db, token);
      if (result?.status === 'reused') {
        req.log.warn({ userId: result.userId }, 'Refresh token reused: the session was revoked');
      }
      if (result?.status !== 'rotated') {
        res.clearCookie(REFRESH_COOKIE, options);
        throw sessionEnded();
      }
      const user = await findUserById(db, result.userId);
      if (user?.is_active !== true) {
        await revokeFamily(db, result.familyId);
        res.clearCookie(REFRESH_COOKIE, options);
        throw user === undefined ? sessionEnded() : accountDisabled();
      }
      await sendSession(res, user, result.token, false);
    },
  );

  router.post(
    '/auth/logout',
    rateLimit(ipLimits.session),
    requireAllowedOrigin(deps.corsOrigins),
    cookieParser(),
    async (req, res) => {
      const token = readRefreshCookie(req);
      if (token !== undefined) await revokeSession(db, token);
      res.clearCookie(REFRESH_COOKIE, options);
      res.status(204).end();
    },
  );

  return router;
}
