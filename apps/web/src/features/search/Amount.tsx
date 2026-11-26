import React, { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import {
  MAX_SEARCH_DAYS,
  searchBodySchema,
  todayInLagos,
  type CapacityUnit,
} from '@coldlink/shared';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PageHeader from '../../components/ui/PageHeader';
import QuantityStepper from '../../components/ui/QuantityStepper';
import StepProgress from '../../components/ui/StepProgress';
import { inputClasses, labelClasses } from '../../components/ui/inputStyles';
import { SEARCH_STEPS, useSearchFlow } from './searchFlow';
import { UNIT_CHOICES } from './units';

const DEFAULT_UNIT: CapacityUnit = 'crates';
const DEFAULT_DAYS = 7;

const QUANTITY_ERROR_ID = 'quantity-error';
const START_DATE_ERROR_ID = 'start-date-error';

type QuantityError = 'missing' | 'notPositive' | 'tooPrecise';

const readQuantity = (text: string): { value: number } | { error: QuantityError } => {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value)) return { error: 'missing' };
  if (value <= 0) return { error: 'notPositive' };
  if (!searchBodySchema.shape.quantity.safeParse(value).success) return { error: 'tooPrecise' };
  return { value };
};

// The API refuses a start before today in Lagos (decision 74); ISO dates compare as strings.
const isValidStart = (date: string, today: string) =>
  z.iso.date().safeParse(date).success && date >= today;

const Amount = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { draft, update } = useSearchFlow();
  const today = todayInLagos();
  const initial = draft.amount;

  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '');
  const [unit, setUnit] = useState<CapacityUnit>(initial?.capacity_unit ?? DEFAULT_UNIT);
  const [days, setDays] = useState(initial?.days ?? DEFAULT_DAYS);
  const [startDate, setStartDate] = useState(
    initial && initial.start_date >= today ? initial.start_date : today,
  );
  const [quantityError, setQuantityError] = useState<QuantityError>();
  const [startDateError, setStartDateError] = useState(false);

  if (!draft.place) return <Navigate to={SEARCH_STEPS.place} replace />;
  if (!draft.crop) return <Navigate to={SEARCH_STEPS.crop} replace />;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsedQuantity = readQuantity(quantity);
    const startValid = isValidStart(startDate, today);
    setQuantityError('error' in parsedQuantity ? parsedQuantity.error : undefined);
    setStartDateError(!startValid);
    if ('error' in parsedQuantity || !startValid) return;

    update({
      amount: { quantity: parsedQuantity.value, capacity_unit: unit, days, start_date: startDate },
    });
    void navigate(SEARCH_STEPS.results);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('search.amount.navTitle')} showBack={true} />
      <StepProgress step={3} count={3} label={t('search.step', { step: 3, count: 3 })} />

      <PageHeader title={t('search.amount.title')} intro={t('search.amount.intro')} />

      <div className="flex flex-col gap-7 px-5 pt-6 pb-32">
        <div>
          <label htmlFor="quantity" className={labelClasses}>
            {t('search.amount.quantityLabel')}
          </label>
          <input
            id="quantity"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={t('search.amount.quantityPlaceholder')}
            aria-invalid={quantityError !== undefined}
            aria-describedby={quantityError ? QUANTITY_ERROR_ID : undefined}
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setQuantityError(undefined);
            }}
            className={`${inputClasses(quantityError !== undefined)} text-subtitle`}
          />
          {quantityError && (
            <div className="mt-2">
              <ErrorMessage id={QUANTITY_ERROR_ID}>
                {t(`search.amount.quantityErrors.${quantityError}`)}
              </ErrorMessage>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="block text-label font-semibold text-ink mb-1">
            {t('search.amount.unitLegend')}
          </legend>
          <p className="text-copy-muted text-label mb-3">{t('search.amount.unitHint')}</p>
          <div className="flex flex-col border border-line rounded-xl divide-y divide-line overflow-hidden">
            {UNIT_CHOICES.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 min-h-13 px-4 py-3 bg-surface cursor-pointer transition-colors hover:bg-surface-muted has-checked:bg-primary-faint has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-primary"
              >
                <input
                  type="radio"
                  name="capacity-unit"
                  value={option}
                  checked={unit === option}
                  onChange={() => setUnit(option)}
                  className="w-5 h-5 accent-primary shrink-0"
                />
                <span className="text-ink text-body font-medium">
                  {t(`search.units.${option}.name`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <h2 className="text-label font-semibold text-ink mb-1.5">
            {t('search.amount.daysTitle')}
          </h2>
          <QuantityStepper
            value={days}
            onChange={setDays}
            max={MAX_SEARCH_DAYS}
            label={t('search.amount.daysLabel', { count: days })}
            decreaseLabel={t('search.amount.removeDay')}
            increaseLabel={t('search.amount.addDay')}
          />
        </div>

        <div>
          <label htmlFor="start-date" className={labelClasses}>
            {t('search.amount.startLabel')}
          </label>
          <input
            id="start-date"
            type="date"
            min={today}
            aria-invalid={startDateError}
            aria-describedby={startDateError ? START_DATE_ERROR_ID : undefined}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setStartDateError(false);
            }}
            className={inputClasses(startDateError)}
          />
          {startDateError && (
            <div className="mt-2">
              <ErrorMessage id={START_DATE_ERROR_ID}>{t('search.amount.startError')}</ErrorMessage>
            </div>
          )}
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton type="submit" disabled={quantity.trim() === ''}>
          {t('search.amount.submit')}
        </PrimaryButton>
      </BottomActionBar>
    </form>
  );
};

export default Amount;
