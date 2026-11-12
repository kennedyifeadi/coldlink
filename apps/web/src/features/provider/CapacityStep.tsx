import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { backupPowerValues, type CapacityUnit } from '@coldlink/shared';
import PrimaryButton from '../../components/ui/PrimaryButton';
import QuantityStepper from '../../components/ui/QuantityStepper';
import { UNIT_CHOICES } from '../search/units';
import { ChoiceList, TextField } from './fields';
import { readCapacity } from './providerForm';
import StepScreen from './StepScreen';
import { useStepForm } from './useStepForm';

// The largest minimum stay the API takes (createProviderBodySchema's min_storage_days).
const MAX_MIN_DAYS = 365;

const CapacityStep = () => {
  const { t } = useTranslation();
  const { form, change, errorFor, continueWith, redirect } = useStepForm('capacity');

  if (redirect) return <Navigate to={redirect} replace />;

  const unitName = (unit: CapacityUnit) => t(`provider.capacity.perUnit.${unit}`);

  return (
    <StepScreen
      step="capacity"
      title={t('provider.capacity.title')}
      intro={t('provider.capacity.intro')}
      onSubmit={() => continueWith(readCapacity(form))}
      action={
        <PrimaryButton type="submit" withArrow>
          {t('common.continue')}
        </PrimaryButton>
      }
    >
      <ChoiceList
        name="capacity-unit"
        legend={t('provider.capacity.unitLegend')}
        hint={t('provider.capacity.unitHint')}
        choices={UNIT_CHOICES.map((unit) => ({
          value: unit,
          label: t(`search.units.${unit}.name`),
        }))}
        value={form.unit}
        onChange={(unit) => change('capacity_unit', { unit })}
        error={errorFor('capacity_unit')}
      />

      <TextField
        id="capacity"
        label={t('provider.capacity.capacityLabel')}
        hint={t('provider.capacity.capacityHint')}
        inputMode="decimal"
        placeholder={t('provider.capacity.capacityPlaceholder')}
        suffix={form.unit && t(`provider.capacity.unitSuffix.${form.unit}`)}
        value={form.capacity}
        onChange={(capacity) => change('capacity_total', { capacity })}
        error={errorFor('capacity_total')}
      />

      <TextField
        id="price"
        label={
          form.unit
            ? t('provider.capacity.priceLabelFor', { unit: unitName(form.unit) })
            : t('provider.capacity.priceLabel')
        }
        hint={t('provider.capacity.priceHint')}
        inputMode="decimal"
        placeholder={t('provider.capacity.pricePlaceholder')}
        suffix={t('provider.capacity.naira')}
        value={form.price}
        onChange={(price) => change('price_per_unit_per_day_kobo', { price })}
        error={errorFor('price_per_unit_per_day_kobo')}
      />

      <div>
        <h2 className="block text-label font-medium text-copy mb-1">
          {t('provider.capacity.minDaysTitle')}
        </h2>
        <p className="text-copy-muted text-body mb-3">{t('provider.capacity.minDaysHint')}</p>
        <QuantityStepper
          value={form.minDays}
          onChange={(minDays) => change('min_storage_days', { minDays })}
          max={MAX_MIN_DAYS}
          label={t('provider.capacity.minDaysLabel', { count: form.minDays })}
          decreaseLabel={t('provider.capacity.removeDay')}
          increaseLabel={t('provider.capacity.addDay')}
        />
      </div>

      <fieldset>
        <legend className="block text-label font-medium text-copy mb-1">
          {t('provider.capacity.temperatureLegend')}
          <span className="text-copy-subtle font-normal"> {t('provider.onboarding.optional')}</span>
        </legend>
        <p className="text-copy-muted text-body mb-3">{t('provider.capacity.temperatureHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="temp-min"
            label={t('provider.capacity.tempMinLabel')}
            inputMode="decimal"
            suffix={t('provider.capacity.celsius')}
            value={form.tempMin}
            onChange={(tempMin) => change('temp_min_c', { tempMin })}
            error={errorFor('temp_min_c')}
          />
          <TextField
            id="temp-max"
            label={t('provider.capacity.tempMaxLabel')}
            inputMode="decimal"
            suffix={t('provider.capacity.celsius')}
            value={form.tempMax}
            onChange={(tempMax) => change('temp_max_c', { tempMax })}
            error={errorFor('temp_max_c')}
          />
        </div>
      </fieldset>

      <ChoiceList
        name="backup-power"
        legend={t('provider.capacity.backupLegend')}
        optional
        choices={backupPowerValues.map((value) => ({
          value,
          label: t(`provider.capacity.backup.${value}`),
        }))}
        value={form.backupPower}
        onChange={(backupPower) => change('has_backup_power', { backupPower })}
        error={errorFor('has_backup_power')}
      />
    </StepScreen>
  );
};

export default CapacityStep;
