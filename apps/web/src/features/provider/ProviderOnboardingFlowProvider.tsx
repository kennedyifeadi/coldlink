import React, { useMemo, useState, type ReactNode } from 'react';
import { useSession } from '../../session/sessionContext';
import { OnboardingFlowContext, type OnboardingDraft, type OnboardingFlow } from './onboardingFlow';
import { emptyForms } from './providerForm';

const emptyDraft: OnboardingDraft = {
  forms: emptyForms,
  completed: [],
  serverErrors: {},
  created: undefined,
};

interface HeldDraft {
  userId: string | undefined;
  draft: OnboardingDraft;
}

// Above the routes, like SearchFlowProvider, so the draft survives moving between steps. It belongs
// to the user who typed it: after a sign-out and another sign-in the wizard starts empty.
const ProviderOnboardingFlowProvider = ({ children }: { children: ReactNode }) => {
  const session = useSession();
  const userId = session.status === 'signedIn' ? session.user.id : undefined;
  const [held, setHeld] = useState<HeldDraft>({ userId: undefined, draft: emptyDraft });
  const draft = held.userId === userId ? held.draft : emptyDraft;

  const flow = useMemo<OnboardingFlow>(() => {
    const change = (update: (current: OnboardingDraft) => OnboardingDraft) =>
      setHeld((current) => ({
        userId,
        draft: update(current.userId === userId ? current.draft : emptyDraft),
      }));

    return {
      draft,
      edit: (step, changes, field) =>
        change((current) => ({
          ...current,
          forms: { ...current.forms, [step]: { ...current.forms[step], ...changes } },
          serverErrors: { ...current.serverErrors, [field]: undefined },
        })),
      complete: (step) =>
        change((current) =>
          current.completed.includes(step)
            ? current
            : { ...current, completed: [...current.completed, step] },
        ),
      setServerErrors: (serverErrors) => change((current) => ({ ...current, serverErrors })),
      setCreated: (created) => change((current) => ({ ...current, created })),
      reset: () => change(() => emptyDraft),
    };
  }, [draft, userId]);

  return <OnboardingFlowContext value={flow}>{children}</OnboardingFlowContext>;
};

export default ProviderOnboardingFlowProvider;
