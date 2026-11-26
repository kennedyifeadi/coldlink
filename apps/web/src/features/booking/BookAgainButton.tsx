import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FarmerBookingSummary } from '@coldlink/shared';
import { describeApiError } from '../../api/describeError';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { useBookAgain } from './useBookAgain';

const BookAgainButton = ({ booking }: { booking: FarmerBookingSummary }) => {
  const { t } = useTranslation();
  const bookAgain = useBookAgain();

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => bookAgain.mutate(booking)}
        disabled={bookAgain.isPending}
        aria-label={t('booking.myBookings.bookAgainAt', {
          facility: booking.provider.display_name,
        })}
        className="w-full min-h-12 px-5 flex items-center justify-center gap-2 border border-line-strong text-ink font-semibold text-body hover:bg-surface-muted rounded-full transition-colors disabled:text-copy-subtle disabled:cursor-not-allowed"
      >
        <RotateCcw size={18} aria-hidden="true" />
        {bookAgain.isPending
          ? t('booking.myBookings.checkingSpace')
          : t('booking.myBookings.bookAgain')}
      </button>
      {bookAgain.isError && <ErrorMessage>{describeApiError(bookAgain.error, t)}</ErrorMessage>}
    </div>
  );
};

export default BookAgainButton;
