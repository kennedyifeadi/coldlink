import React, { useMemo, useState, type ReactNode } from 'react';
import { SignInFlowContext, type PendingSignIn, type SignInFlow } from './signInFlow';

// Above the routes, so the pending sign-in survives a visit to the privacy notice.
const SignInFlowProvider = ({ children }: { children: ReactNode }) => {
  const [pending, setPending] = useState<PendingSignIn>();

  const flow = useMemo<SignInFlow>(
    () => ({
      pending,
      begin: setPending,
      update: (changes) => setPending((current) => current && { ...current, ...changes }),
      clear: () => setPending(undefined),
    }),
    [pending],
  );

  return <SignInFlowContext value={flow}>{children}</SignInFlowContext>;
};

export default SignInFlowProvider;
