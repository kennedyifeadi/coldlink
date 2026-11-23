import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BookingStatusChange } from '@coldlink/shared';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import { formatLagosTime } from '../../i18n/format';
import { statusLabelKey, type StatusViewer } from './bookingStatus';

interface StatusHistoryProps {
  history: BookingStatusChange[];
  viewer?: StatusViewer;
}

/** Each status the booking entered and when, on the Lagos clock, oldest first. */
const StatusHistory = ({ history, viewer }: StatusHistoryProps) => {
  const { t } = useTranslation();

  return (
    <Card className="p-6 mb-4">
      <CardTitle>{t('booking.detail.historyTitle')}</CardTitle>
      <ol className="flex flex-col">
        {history.map((change, index) => (
          <li key={`${change.status}-${change.at}`} className="flex gap-4">
            <div className="flex flex-col items-center" aria-hidden="true">
              <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
              {index < history.length - 1 && <span className="w-px flex-grow bg-line-strong" />}
            </div>
            <div className="pb-4">
              <p className="text-ink text-body font-semibold">
                {t(statusLabelKey(change.status, viewer))}
              </p>
              <p className="text-copy-muted text-label">
                {t('booking.detail.at', formatLagosTime(change.at))}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
};

export default StatusHistory;
