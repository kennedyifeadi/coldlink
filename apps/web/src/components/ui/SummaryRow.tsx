import React from 'react';

type SummaryRowVariant = 'default' | 'total' | 'highlight';

interface SummaryRowProps {
  label: string;
  value: string;
  variant?: SummaryRowVariant;
}

const variantClasses: Record<SummaryRowVariant, { row: string; label: string; value: string }> = {
  default: { row: 'text-body', label: 'text-copy-muted', value: 'font-medium text-ink' },
  total: { row: 'text-subtitle font-bold', label: 'text-ink', value: 'text-ink' },
  highlight: {
    row: 'text-body',
    label: 'text-primary-strong',
    value: 'font-semibold text-primary-strong',
  },
};

const SummaryRow = ({ label, value, variant = 'default' }: SummaryRowProps) => {
  const classes = variantClasses[variant];

  return (
    <div className={`flex justify-between items-baseline gap-4 ${classes.row}`}>
      <span className={classes.label}>{label}</span>
      <span className={`text-right tabular-nums ${classes.value}`}>{value}</span>
    </div>
  );
};

export default SummaryRow;
