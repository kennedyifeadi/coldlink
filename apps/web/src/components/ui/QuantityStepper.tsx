import React, { type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  min?: number;
  max?: number;
}

interface StepButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

const StepButton = ({ label, disabled, onClick, children }: StepButtonProps) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={`w-14 h-14 rounded-full flex items-center justify-center bg-surface-muted transition-colors ${disabled ? 'text-disabled' : 'text-primary-strong hover:bg-primary-faint'}`}
  >
    {children}
  </button>
);

const QuantityStepper = ({
  value,
  onChange,
  label,
  decreaseLabel,
  increaseLabel,
  min = 1,
  max = Infinity,
}: QuantityStepperProps) => (
  <div className="flex items-center justify-between bg-surface border border-line rounded-2xl p-3 shadow-card">
    <StepButton label={decreaseLabel} disabled={value <= min} onClick={() => onChange(value - 1)}>
      <Minus size={24} />
    </StepButton>

    <div aria-live="polite" aria-atomic="true" className="flex flex-col items-center">
      <span className="text-display font-bold text-ink leading-none mb-1">{value}</span>
      <span className="text-copy-muted text-label font-medium uppercase tracking-wider">
        {label}
      </span>
    </div>

    <StepButton label={increaseLabel} disabled={value >= max} onClick={() => onChange(value + 1)}>
      <Plus size={24} />
    </StepButton>
  </div>
);

export default QuantityStepper;
