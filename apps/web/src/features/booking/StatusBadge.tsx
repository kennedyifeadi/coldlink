import React from 'react';
import {
  CheckCircle2,
  CircleSlash,
  Hourglass,
  PackageCheck,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BookingStatus } from '@coldlink/shared';
import { STATUS_TONES, type StatusTone } from './bookingStatus';

const toneClasses: Record<StatusTone, string> = {
  waiting: 'bg-accent-faint text-accent-ink',
  active: 'bg-primary-soft text-ink',
  done: 'bg-surface-sunken text-copy-muted',
  ended: 'bg-alert-faint text-alert-strong',
};

const statusIcons: Record<BookingStatus, LucideIcon> = {
  payment_pending: Hourglass,
  pending_provider: Hourglass,
  confirmed: CheckCircle2,
  in_storage: Snowflake,
  completed: PackageCheck,
  rejected: CircleSlash,
  expired: CircleSlash,
  cancelled: CircleSlash,
  no_show: CircleSlash,
};

// The status in words and an icon as well as the colour, so it never relies on colour alone.
const StatusBadge = ({ status }: { status: BookingStatus }) => {
  const { t } = useTranslation();
  const Icon = statusIcons[status];

  return (
    <span
      data-tone={STATUS_TONES[status]}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label font-semibold ${toneClasses[STATUS_TONES[status]]}`}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {t(`booking.status.${status}`)}
    </span>
  );
};

export default StatusBadge;
