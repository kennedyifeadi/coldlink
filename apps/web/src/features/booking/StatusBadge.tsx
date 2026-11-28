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
import { STATUS_TONES, statusLabelKey, type StatusTone, type StatusViewer } from './bookingStatus';

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

interface StatusPillProps {
  tone: StatusTone;
  icon: LucideIcon;
  children: string;
}

// A status in words and an icon as well as the colour, so it never relies on colour alone.
export const StatusPill = ({ tone, icon: Icon, children }: StatusPillProps) => (
  <span
    data-tone={tone}
    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label font-semibold ${toneClasses[tone]}`}
  >
    <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
    {children}
  </span>
);

const StatusBadge = ({ status, viewer }: { status: BookingStatus; viewer?: StatusViewer }) => {
  const { t } = useTranslation();

  return (
    <StatusPill tone={STATUS_TONES[status]} icon={statusIcons[status]}>
      {t(statusLabelKey(status, viewer))}
    </StatusPill>
  );
};

export default StatusBadge;
