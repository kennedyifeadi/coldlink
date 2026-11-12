import React, { useRef } from 'react';
import { Check } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import { validationIssueSchema, type CreateProviderBody } from '@coldlink/shared';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import { isApiError } from '../../api/client';
import { describeApiError } from '../../api/describeError';
import { createProvider, OWN_PROVIDERS_KEY } from '../../api/providers';
import { cropCategoriesQuery } from '../../api/referenceData';
import { useSession, useSessionStore } from '../../session/sessionContext';
import { produceIcon } from '../search/produceIcons';
import {
  FORM_STEPS,
  ONBOARDING_STEPS,
  fieldSteps,
  readBody,
  useOnboardingFlow,
} from './onboardingFlow';
import { readProduce, type ProviderField } from './providerForm';
import StepScreen from './StepScreen';
import { useStepForm } from './useStepForm';

const CATEGORY_ERROR_ID = 'category-ids-error';

const validationDetailsSchema = z.array(validationIssueSchema);

/** The API's messages for fields a step asks for, by field; undefined if there are none. */
const readFieldErrors = (error: unknown) => {
  if (!isApiError(error, 'validation_failed')) return undefined;
  const issues = validationDetailsSchema.safeParse(error.details).data ?? [];
  const byField: Partial<Record<ProviderField, string>> = {};
  for (const { location, path, message } of issues) {
    const field = path.split('.')[0] as ProviderField;
    if (location === 'body' && fieldSteps[field] && !byField[field]) byField[field] = message;
  }
  return Object.keys(byField).length > 0 ? byField : undefined;
};

const CategorySkeleton = () => (
  <div aria-hidden="true" className="flex flex-wrap gap-2">
    {Array.from({ length: 7 }, (_, index) => (
      <div key={index} className="h-12 w-28 rounded-full bg-surface-muted" />
    ))}
  </div>
);

const ProduceStep = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const flow = useOnboardingFlow();
  const { form, change, errorFor, setErrors, redirect } = useStepForm('produce');
  const categories = useQuery(cropCategoriesQuery);
  // The button is disabled while the request is out; this also stops a second tap that lands
  // before the re-render, so one listing is never created twice.
  const submitting = useRef(false);

  const create = useMutation({
    mutationFn: (body: CreateProviderBody) => createProvider(store.authorizedRequest, body),
    onSuccess: (provider) => {
      flow.setCreated(provider);
      // A cached list from before would leave the new facility out of Your facilities.
      queryClient.removeQueries({ queryKey: OWN_PROVIDERS_KEY });
      // Roles come with the session, so a first facility needs a new one to show the provider role.
      if (session.status === 'signedIn' && !session.user.roles.includes('provider')) {
        store.refreshProfile();
      }
      void navigate(ONBOARDING_STEPS.photos, { replace: true });
    },
    onError: (error) => {
      const fieldErrors = readFieldErrors(error);
      if (!fieldErrors) return;
      flow.setServerErrors(fieldErrors);
      const firstStep = FORM_STEPS.find((step) =>
        Object.keys(fieldErrors).some((field) => fieldSteps[field as ProviderField] === step),
      );
      if (firstStep && firstStep !== 'produce') void navigate(ONBOARDING_STEPS[firstStep]);
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  if (redirect) return <Navigate to={redirect} replace />;

  const handleSubmit = () => {
    if (submitting.current) return;
    const read = readProduce(form);
    if ('errors' in read) {
      setErrors(read.errors);
      return;
    }
    flow.complete('produce');
    const body = readBody({ ...flow.draft.forms, produce: form });
    if (!body) return;
    submitting.current = true;
    create.mutate(body);
  };

  const toggle = (categoryId: string) => {
    const categoryIds = form.categoryIds.includes(categoryId)
      ? form.categoryIds.filter((id) => id !== categoryId)
      : [...form.categoryIds, categoryId];
    change('category_ids', { categoryIds });
  };

  const categoryError = errorFor('category_ids');
  const submitError =
    create.isError && !readFieldErrors(create.error)
      ? describeApiError(create.error, t)
      : undefined;

  return (
    <StepScreen
      step="produce"
      title={t('provider.produce.title')}
      intro={t('provider.produce.intro')}
      onSubmit={handleSubmit}
      action={
        <div className="flex flex-col gap-3">
          {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
          <PrimaryButton type="submit" disabled={create.isPending || !categories.isSuccess}>
            {create.isPending
              ? t('provider.produce.submitting')
              : submitError
                ? t('common.tryAgain')
                : t('provider.produce.submit')}
          </PrimaryButton>
        </div>
      }
    >
      {categories.isPending && (
        <>
          <p role="status" className="sr-only">
            {t('provider.produce.loading')}
          </p>
          <CategorySkeleton />
        </>
      )}

      {categories.isError && (
        <div className="flex flex-col gap-3">
          <ErrorMessage>{describeApiError(categories.error, t)}</ErrorMessage>
          <TextButton onClick={() => void categories.refetch()} disabled={categories.isFetching}>
            {t('common.tryAgain')}
          </TextButton>
        </div>
      )}

      {categories.isSuccess && (
        <div
          role="group"
          aria-label={t('provider.produce.groupLabel')}
          aria-describedby={categoryError ? CATEGORY_ERROR_ID : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {categories.data.data.map((category) => {
              const selected = form.categoryIds.includes(category.id);
              const Icon = produceIcon(category.slug);
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(category.id)}
                  className={`flex items-center gap-2 min-h-12 pl-3 pr-4 rounded-full border transition-all ${
                    selected
                      ? 'bg-primary-soft border-primary text-ink shadow-sm'
                      : 'bg-surface-muted border-transparent text-copy hover:bg-surface-sunken'
                  }`}
                >
                  {selected ? (
                    <Check size={18} className="text-primary-strong" aria-hidden="true" />
                  ) : (
                    <Icon size={18} className="text-primary-strong" aria-hidden="true" />
                  )}
                  <span className="font-medium text-body">{category.name}</span>
                </button>
              );
            })}
          </div>
          {categoryError && (
            <div className="mt-3">
              <ErrorMessage id={CATEGORY_ERROR_ID}>{categoryError}</ErrorMessage>
            </div>
          )}
        </div>
      )}
    </StepScreen>
  );
};

export default ProduceStep;
