import React from 'react';
import { Ban, CircleCheck, Clock, CircleX, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VerificationStatus } from '@coldlink/shared';

// Always an icon and a word with the colour, never colour alone (docs/ux-writing.md).
const styles: Record<VerificationStatus, { icon: LucideIcon; classes: string }> = {
  pending: { icon: Clock, classes: 'bg-accent-faint text-accent-ink' },
  approved: { icon: CircleCheck, classes: 'bg-primary-faint text-primary-strong' },
  suspended: { icon: Ban, classes: 'bg-surface-muted text-copy' },
  rejected: { icon: CircleX, classes: 'bg-surface-muted text-alert-strong' },
};

const VerificationBadge = ({ status }: { status: VerificationStatus }) => {
  const { t } = useTranslation();
  const { icon: Icon, classes } = styles[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label font-semibold ${classes}`}
    >
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      {t(`provider.status.${status}`)}
    </span>
  );
};

export default VerificationBadge;
