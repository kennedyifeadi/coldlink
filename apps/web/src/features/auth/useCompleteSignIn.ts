import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionResponse } from '@coldlink/shared';
import { useSessionStore } from '../../session/sessionContext';
import { SIGNED_IN_HOME, type ReturnToState } from '../../session/routes';
import { useSignInFlow } from './signInFlow';

/**
 * Starts the session and moves on: a new account sees its ColdLink ID first (PRD 7.1), which then
 * leads on to where sign-in was asked for.
 */
export const useCompleteSignIn = () => {
  const store = useSessionStore();
  const flow = useSignInFlow();
  const navigate = useNavigate();

  return (session: SessionResponse) => {
    const returnTo = flow.pending?.returnTo;
    store.start(session);
    // The router navigates in a transition. Clearing the flow outside it would render this
    // screen once without a pending sign-in, and its redirect to the phone screen would win.
    startTransition(() => {
      flow.clear();
      if (session.is_new_user) {
        const state = returnTo === undefined ? undefined : ({ returnTo } satisfies ReturnToState);
        void navigate('/userid', { replace: true, state });
      } else {
        void navigate(returnTo ?? SIGNED_IN_HOME, { replace: true });
      }
    });
  };
};
