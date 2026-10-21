import React from 'react';

type SummaryRowVariant = 'default' | 'total' | 'highlight';

interface SummaryRowProps {
  label: string;
  value: string;
  variant?: SummaryRowVariant;
}

const variantClasses: Record<SummaryRowVariant, { row: string; label: string; value: string }> = {
  default: { row: 'text-body', label: 'text-copy-muted', value: 'font-medium text-ink' },
  total: { row: 'text-subtitle font-bold', label: 'text-ink', value: 'text-primary-strong' },
  highlight: {
    row: 'text-body',
    label: 'text-primary-strong',
    value: 'font-medium text-primary-strong',
  },
};

const SummaryRow = ({ label, value, variant = 'default' }: SummaryRowProps) => {
  const classes = variantClasses[variant];

  return (
    <div className={`flex justify-between items-center gap-4 ${classes.row}`}>
      <span className={classes.label}>{label}</span>
      <span className={`text-right ${classes.value}`}>{value}</span>
    </div>
  );
};

export default SummaryRow;
