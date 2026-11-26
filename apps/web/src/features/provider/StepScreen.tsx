import React, { type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PageHeader from '../../components/ui/PageHeader';
import StepProgress from '../../components/ui/StepProgress';
import { STEP_COUNT, stepNumber, type FormStep } from './onboardingFlow';

interface StepScreenProps {
  step: FormStep | 'photos';
  title: string;
  intro: string;
  onSubmit: () => void;
  /** The bottom bar: the step's one primary action, and anything that goes with it. */
  action: ReactNode;
  /** False once the facility exists, since its details can no longer be changed here. */
  showBack?: boolean;
  children: ReactNode;
}

/** One step of the onboarding wizard, laid out as the search steps are. */
const StepScreen = ({
  step,
  title,
  intro,
  onSubmit,
  action,
  showBack = true,
  children,
}: StepScreenProps) => {
  const { t } = useTranslation();
  const number = stepNumber(step);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('provider.onboarding.navTitle')} showBack={showBack} />
      <StepProgress
        step={number}
        count={STEP_COUNT}
        label={t('provider.onboarding.step', {
          step: number,
          count: STEP_COUNT,
          name: t(`provider.onboarding.steps.${step}`),
        })}
      />

      <PageHeader title={title} intro={intro} />
      <div className="flex flex-col gap-7 px-5 pt-6 pb-36">{children}</div>

      <BottomActionBar>{action}</BottomActionBar>
    </form>
  );
};

export default StepScreen;
