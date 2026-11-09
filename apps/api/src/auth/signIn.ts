import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { otpMatches } from './otp.js';
import { consumeOtp, findLiveOtp, recordWrongGuess } from './otpStore.js';
import { startSession } from './sessions.js';
import { createUser, findUserByPhone, recordLogin, type User } from './users.js';

export interface SignInRequest {
  phone: string;
  code: string | undefined;
  consent: boolean;
  otpPepper: string;
  /** app_config `otp_required` (decision 58). */
  otpRequired: boolean;
}

export type SignInResult =
  | {
      status: 'signed_in';
      user: User;
      refreshToken: string;
      isNewUser: boolean;
      otpSkipped: boolean;
    }
  /** Wrong, expired, used up or missing: callers must not tell these apart. */
  | { status: 'invalid_code' }
  | { status: 'consent_required' }
  | { status: 'account_disabled' };

async function register(
  trx: Database,
  phone: string,
  consent: boolean,
): Promise<{ user: User; created: boolean } | 'consent_required'> {
  if (!consent) return 'consent_required';
  return createUser(trx, phone);
}

async function signInExisting(
  trx: Database,
  user: User,
  consent: boolean,
): Promise<User | 'consent_required' | 'account_disabled'> {
  if (!user.is_active) return 'account_disabled';
  // Accounts made before consent was collected, such as dev sample owners, give it now.
  if (user.consented_at === null && !consent) return 'consent_required';
  return recordLogin(trx, user, consent);
}

/**
 * Checks the code against the number's live code and signs the user in, creating the account on
 * the first verification. A wrong guess is recorded and returned, not thrown, so the count
 * commits. The code is consumed only once the sign-in goes ahead (or the account is found
 * disabled), so a new user asked for consent can send it with the same code.
 */
export function signInWithOtp(db: Database, request: SignInRequest): Promise<SignInResult> {
  return inTransaction(db, async (trx) => {
    const { phone, code, consent, otpPepper, otpRequired } = request;
    if (code === undefined) {
      return otpRequired ? { status: 'invalid_code' } : registerWithoutOtp(trx, phone, consent);
    }
    const otp = await findLiveOtp(trx, phone);
    if (otp === undefined) return { status: 'invalid_code' };
    if (!otpMatches(otpPepper, phone, code, otp.codeHash)) {
      await recordWrongGuess(trx, otp.id);
      return { status: 'invalid_code' };
    }
    const existing = await findUserByPhone(trx, phone);
    const outcome =
      existing === undefined
        ? await register(trx, phone, consent)
        : await signInExisting(trx, existing, consent);
    if (outcome === 'consent_required') return { status: outcome };
    await consumeOtp(trx, otp.id);
    if (outcome === 'account_disabled') return { status: outcome };
    const { user, created } = 'user' in outcome ? outcome : { user: outcome, created: false };
    const refreshToken = await startSession(trx, user.id);
    return { status: 'signed_in', user, refreshToken, isNewUser: created, otpSkipped: false };
  });
}

/**
 * With otp_required off, only a number with no account may sign in without a code. An existing
 * account always needs one, so turning the flag off never lets anyone into another person's
 * bookings (PRD 7.1).
 */
async function registerWithoutOtp(
  trx: Database,
  phone: string,
  consent: boolean,
): Promise<SignInResult> {
  if ((await findUserByPhone(trx, phone)) !== undefined) return { status: 'invalid_code' };
  const outcome = await register(trx, phone, consent);
  if (outcome === 'consent_required') return { status: outcome };
  if (!outcome.created) return { status: 'invalid_code' };
  const refreshToken = await startSession(trx, outcome.user.id);
  return {
    status: 'signed_in',
    user: outcome.user,
    refreshToken,
    isNewUser: true,
    otpSkipped: true,
  };
}
