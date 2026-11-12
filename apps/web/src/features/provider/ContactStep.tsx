import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { facilityTypes } from '@coldlink/shared';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { useSession } from '../../session/sessionContext';
import { facilityTypeIcons } from '../search/facilityTypeIcons';
import { ChoiceList, TextField } from './fields';
import { readContact } from './providerForm';
import StepScreen from './StepScreen';
import { useStepForm } from './useStepForm';

const ContactStep = () => {
  const { t } = useTranslation();
  const session = useSession();
  const { form, change, errorFor, continueWith, redirect } = useStepForm('contact');

  if (redirect) return <Navigate to={redirect} replace />;

  const ownNumber = session.status === 'signedIn' ? session.user.phone_masked : '';

  return (
    <StepScreen
      step="contact"
      title={t('provider.contact.title')}
      intro={t('provider.contact.intro')}
      onSubmit={() => continueWith(readContact(form))}
      action={
        <PrimaryButton type="submit" withArrow>
          {t('common.continue')}
        </PrimaryButton>
      }
    >
      <TextField
        id="display-name"
        label={t('provider.contact.displayNameLabel')}
        hint={t('provider.contact.displayNameHint')}
        placeholder={t('provider.contact.displayNamePlaceholder')}
        value={form.displayName}
        onChange={(displayName) => change('display_name', { displayName })}
        error={errorFor('display_name')}
      />

      <TextField
        id="business-name"
        label={t('provider.contact.businessNameLabel')}
        hint={t('provider.contact.businessNameHint')}
        optional
        value={form.businessName}
        onChange={(businessName) => change('business_name', { businessName })}
        error={errorFor('business_name')}
      />

      <ChoiceList
        name="facility-type"
        legend={t('provider.contact.facilityTypeLegend')}
        choices={facilityTypes.map((type) => ({
          value: type,
          label: t(`search.facilityTypes.${type}`),
          icon: facilityTypeIcons[type],
        }))}
        value={form.facilityType}
        onChange={(facilityType) => change('facility_type', { facilityType })}
        error={errorFor('facility_type')}
      />

      <ChoiceList
        name="booking-phone"
        legend={t('provider.contact.phoneLegend')}
        hint={t('provider.contact.phoneHint')}
        choices={[
          { value: 'own', label: t('provider.contact.ownNumber', { number: ownNumber }) },
          { value: 'other', label: t('provider.contact.otherNumber') },
        ]}
        value={form.useOwnPhone ? 'own' : 'other'}
        onChange={(choice) => change('phone', { useOwnPhone: choice === 'own' })}
        error={form.useOwnPhone ? errorFor('phone') : undefined}
        detail={(choice) =>
          choice === 'other' && (
            <TextField
              id="booking-phone"
              label={t('provider.contact.otherNumberLabel')}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={t('provider.contact.phonePlaceholder')}
              value={form.phone}
              onChange={(phone) => change('phone', { phone })}
              error={errorFor('phone')}
            />
          )
        }
      />

      <TextField
        id="whatsapp"
        label={t('provider.contact.whatsappLabel')}
        hint={t('provider.contact.whatsappHint')}
        optional
        type="tel"
        inputMode="tel"
        placeholder={t('provider.contact.phonePlaceholder')}
        value={form.whatsapp}
        onChange={(whatsapp) => change('whatsapp', { whatsapp })}
        error={errorFor('whatsapp')}
      />
    </StepScreen>
  );
};

export default ContactStep;
