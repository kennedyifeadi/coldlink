import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CapacityUnit, DeliveryQuote } from '@coldlink/shared';
import Card from '../../components/ui/Card';
import Notice from '../../components/ui/Notice';
import SummaryRow from '../../components/ui/SummaryRow';
import { formatKobo, formatNumber } from '../../i18n/format';
import { ChoiceList } from '../provider/fields';
import DeliveryForm from './DeliveryForm';
import type { DeliveryFormErrors, DeliveryFormValues } from './deliveryFields';

/** The delivery's price as the farmer sees it: never the partner's payout or the margin. */
export const DeliveryPrice = ({ quote }: { quote: DeliveryQuote }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 pt-4 border-t border-line">
      <SummaryRow
        label={t('booking.delivery.fee')}
        value={formatKobo(quote.fee_kobo)}
        variant="highlight"
      />
      <p className="text-copy-muted text-label">
        {t('booking.delivery.distance', {
          vehicle: t(`booking.delivery.vehicle.${quote.vehicle_type}`),
          distance: formatNumber(quote.distance_km),
        })}
      </p>
    </div>
  );
};

interface PickupSectionProps {
  facility: string;
  unit: CapacityUnit;
  wanted: boolean;
  onChoose: (wanted: boolean) => void;
  values: DeliveryFormValues;
  onChange: (changes: Partial<DeliveryFormValues>) => void;
  errors: DeliveryFormErrors;
  /** The inbound delivery's quote, once the pin and amount are in. */
  quote: DeliveryQuote | null | undefined;
  detailsLost: boolean;
}

/** PRD 7.4 step 2: an optional inbound delivery, asked for and priced at review. */
const PickupSection = ({
  facility,
  unit,
  wanted,
  onChoose,
  values,
  onChange,
  errors,
  quote,
  detailsLost,
}: PickupSectionProps) => {
  const { t } = useTranslation();

  return (
    <Card className="p-5 flex flex-col gap-5">
      {detailsLost && <Notice tone="waiting">{t('booking.delivery.detailsLost')}</Notice>}
      <ChoiceList
        name="pickup"
        legend={t('booking.delivery.question')}
        hint={t('booking.delivery.questionHint', { facility })}
        choices={[
          { value: 'no', label: t('booking.delivery.noPickup') },
          { value: 'yes', label: t('booking.delivery.yesPickup') },
        ]}
        value={wanted ? 'yes' : 'no'}
        onChange={(choice) => onChoose(choice === 'yes')}
      />
      {wanted && (
        <>
          <DeliveryForm
            direction="inbound"
            unit={unit}
            values={values}
            onChange={onChange}
            errors={errors}
            window={quote ?? undefined}
          />
          {quote && <DeliveryPrice quote={quote} />}
        </>
      )}
    </Card>
  );
};

export default PickupSection;
