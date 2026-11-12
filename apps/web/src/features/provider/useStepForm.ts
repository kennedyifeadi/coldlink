import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FORM_STEPS,
  ONBOARDING_STEPS,
  redirectFor,
  useOnboardingFlow,
  type FormStep,
} from './onboardingFlow';
import type { FieldErrors, OnboardingForms, ProviderField } from './providerForm';

/** A step's entries, kept in the flow as they are typed, and the errors to show beside them. */
export const useStepForm = <S extends FormStep>(step: S) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flow = useOnboardingFlow();
  const [errors, setErrors] = useState<FieldErrors>({});
  const form = flow.draft.forms[step];

  const change = (field: ProviderField, changes: Partial<OnboardingForms[S]>) => {
    flow.edit(step, changes, field);
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const errorFor = (field: ProviderField) => {
    const key = errors[field];
    return key ? t(`provider.errors.${key}`) : flow.draft.serverErrors[field];
  };

  /** Shows the errors, or marks the step done and goes on to the next one. */
  const continueWith = (read: { errors: FieldErrors } | { body: unknown }) => {
    if ('errors' in read) {
      setErrors(read.errors);
      return false;
    }
    flow.complete(step);
    const next = FORM_STEPS[FORM_STEPS.indexOf(step) + 1];
    if (next) void navigate(ONBOARDING_STEPS[next]);
    return true;
  };

  return {
    form,
    change,
    errorFor,
    continueWith,
    setErrors,
    redirect: redirectFor(flow.draft, step),
  };
};
