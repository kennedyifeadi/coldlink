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
import QuantityStepper from '../../components/ui/QuantityStepper';
import StepProgress from '../../components/ui/StepProgress';
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
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col h-full min-h-screen bg-background relative"
    >
      <TopNavBar title={t('search.amount.navTitle')} showBack={true} />
      <StepProgress step={3} count={3} label={t('search.step', { step: 3, count: 3 })} />

      <div className="flex flex-col gap-8 px-6 pt-8 pb-32 flex-grow overflow-y-auto">
        <div>
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-3 leading-tight tracking-tight">
            {t('search.amount.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">{t('search.amount.intro')}</p>
        </div>

        <div>
          <label htmlFor="quantity" className="block text-label font-medium text-copy mb-2">
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
            className={`w-full px-4 py-3.5 text-subtitle text-copy bg-surface border rounded-lg placeholder-copy-subtle outline-none focus:ring-1 transition-all ${
              quantityError
                ? 'border-alert-strong focus:ring-alert-strong'
                : 'border-line-strong focus:border-primary-strong focus:ring-primary-strong'
            }`}
          />
          {quantityError && (
            <div className="mt-3">
              <ErrorMessage id={QUANTITY_ERROR_ID}>
                {t(`search.amount.quantityErrors.${quantityError}`)}
              </ErrorMessage>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="block text-label font-medium text-copy mb-1">
            {t('search.amount.unitLegend')}
          </legend>
          <p className="text-copy-muted text-body mb-3">{t('search.amount.unitHint')}</p>
          <div className="flex flex-col gap-2">
            {UNIT_CHOICES.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 min-h-12 px-4 py-3 rounded-xl border border-transparent bg-surface-muted cursor-pointer transition-all has-checked:bg-primary-faint has-checked:border-primary has-focus-visible:outline-2 has-focus-visible:outline-primary-strong"
              >
                <input
                  type="radio"
                  name="capacity-unit"
                  value={option}
                  checked={unit === option}
                  onChange={() => setUnit(option)}
                  className="w-5 h-5 accent-primary-strong shrink-0"
                />
                <span className="text-copy text-body font-medium">
                  {t(`search.units.${option}.name`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <h2 className="block text-label font-medium text-copy mb-3">
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
          <label htmlFor="start-date" className="block text-label font-medium text-copy mb-2">
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
            className={`w-full px-4 py-3.5 text-body text-copy bg-surface border rounded-lg outline-none focus:ring-1 transition-all ${
              startDateError
                ? 'border-alert-strong focus:ring-alert-strong'
                : 'border-line-strong focus:border-primary-strong focus:ring-primary-strong'
            }`}
          />
          {startDateError && (
            <div className="mt-3">
              <ErrorMessage id={START_DATE_ERROR_ID}>{t('search.amount.startError')}</ErrorMessage>
            </div>
          )}
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton type="submit" disabled={quantity.trim() === ''} withArrow>
          {t('search.amount.submit')}
        </PrimaryButton>
      </BottomActionBar>
    </form>
  );
};

export default Amount;
