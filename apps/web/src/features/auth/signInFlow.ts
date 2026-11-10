import { createContext, useContext } from 'react';

/** A sign-in between the phone screen and a session. Held in memory only, never in storage. */
export interface PendingSignIn {
  /** As +234 and ten digits. */
  phone: string;
  resendAfterSeconds: number;
  /** Local development only (decision 57). */
  devCode?: string;
  /** Kept after `consent_required`, which leaves the code unused, to resend with consent. */
  code?: string;
  /** Where a guard sent the user from, to return there after signing in. */
  returnTo?: string;
}

export interface SignInFlow {
  pending: PendingSignIn | undefined;
  begin: (pending: PendingSignIn) => void;
  update: (changes: Partial<PendingSignIn>) => void;
  clear: () => void;
}

export const SignInFlowContext = createContext<SignInFlow | null>(null);

export const useSignInFlow = () => {
  const flow = useContext(SignInFlowContext);
  if (!flow) throw new Error('useSignInFlow needs a SignInFlowProvider');
  return flow;
};
