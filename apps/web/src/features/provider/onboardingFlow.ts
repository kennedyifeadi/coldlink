import { createContext, useContext } from 'react';
import type { CreateProviderBody, OwnProvider } from '@coldlink/shared';
import { PROVIDER_ONBOARDING_PATH } from '../../session/routes';
import {
  readCapacity,
  readContact,
  readLocation,
  readProduce,
  type OnboardingForms,
  type ProviderField,
} from './providerForm';

export const ONBOARDING_STEPS = {
  contact: `${PROVIDER_ONBOARDING_PATH}/contact`,
  location: `${PROVIDER_ONBOARDING_PATH}/location`,
  capacity: `${PROVIDER_ONBOARDING_PATH}/capacity`,
  produce: `${PROVIDER_ONBOARDING_PATH}/produce`,
  photos: `${PROVIDER_ONBOARDING_PATH}/photos`,
  done: `${PROVIDER_ONBOARDING_PATH}/done`,
} as const;

/** The steps that build the body of POST /providers, in order; photos come after it. */
export const FORM_STEPS = ['contact', 'location', 'capacity', 'produce'] as const;
export type FormStep = (typeof FORM_STEPS)[number];
export const STEP_COUNT = FORM_STEPS.length + 1;

export const stepNumber = (step: FormStep | 'photos') =>
  step === 'photos' ? STEP_COUNT : FORM_STEPS.indexOf(step) + 1;

/** Which step asks for each field, so an error from the API is shown next to its field. */
export const fieldSteps: Partial<Record<ProviderField, FormStep>> = {
  display_name: 'contact',
  business_name: 'contact',
  facility_type: 'contact',
  phone: 'contact',
  whatsapp: 'contact',
  lat: 'location',
  lng: 'location',
  address_text: 'location',
  landmark: 'location',
  lga: 'location',
  capacity_total: 'capacity',
  capacity_unit: 'capacity',
  price_per_unit_per_day_kobo: 'capacity',
  min_storage_days: 'capacity',
  temp_min_c: 'capacity',
  temp_max_c: 'capacity',
  has_backup_power: 'capacity',
  category_ids: 'produce',
};

/**
 * The facility being listed. Held in memory only, like the search: it survives moving between
 * steps and signing in, and is gone after a reload.
 */
export interface OnboardingDraft {
  forms: OnboardingForms;
  /** Steps the provider has continued past. */
  completed: FormStep[];
  /** Messages from a 400 on POST /providers, by field, until the field is changed. */
  serverErrors: Partial<Record<ProviderField, string>>;
  /** Set once POST /providers succeeds; from then on only photos can be added. */
  created: OwnProvider | undefined;
}

export interface OnboardingFlow {
  draft: OnboardingDraft;
  edit: <S extends FormStep>(
    step: S,
    changes: Partial<OnboardingForms[S]>,
    field: ProviderField,
  ) => void;
  complete: (step: FormStep) => void;
  setServerErrors: (errors: Partial<Record<ProviderField, string>>) => void;
  setCreated: (provider: OwnProvider) => void;
  reset: () => void;
}

export const OnboardingFlowContext = createContext<OnboardingFlow | null>(null);

export const useOnboardingFlow = () => {
  const flow = useContext(OnboardingFlowContext);
  if (!flow) throw new Error('useOnboardingFlow needs a ProviderOnboardingFlowProvider');
  return flow;
};

export const firstUnfinishedStep = (draft: OnboardingDraft): FormStep | undefined =>
  FORM_STEPS.find((step) => !draft.completed.includes(step));

/** Where the provider should be instead of this step, if anywhere. */
export const redirectFor = (draft: OnboardingDraft, step: FormStep | 'photos') => {
  if (draft.created) return step === 'photos' ? undefined : ONBOARDING_STEPS.photos;
  const unfinished = FORM_STEPS.slice(0, stepNumber(step) - 1).find(
    (earlier) => !draft.completed.includes(earlier),
  );
  return unfinished && ONBOARDING_STEPS[unfinished];
};

/** The whole body of POST /providers, or undefined while a step still has errors. */
export const readBody = (forms: OnboardingForms): CreateProviderBody | undefined => {
  const contact = readContact(forms.contact);
  const location = readLocation(forms.location);
  const capacity = readCapacity(forms.capacity);
  const produce = readProduce(forms.produce);
  if (!('body' in contact && 'body' in location && 'body' in capacity && 'body' in produce)) {
    return undefined;
  }
  return { ...contact.body, ...location.body, ...capacity.body, ...produce.body };
};
