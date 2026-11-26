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
    className="w-12 h-12 rounded-full flex items-center justify-center border border-line-strong text-primary-strong transition-[background-color,transform] duration-150 hover:bg-primary-faint active:scale-95 disabled:text-disabled disabled:border-line disabled:hover:bg-transparent disabled:active:scale-100"
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
  <div className="flex items-center justify-between border border-line rounded-xl px-3 py-3">
    <StepButton label={decreaseLabel} disabled={value <= min} onClick={() => onChange(value - 1)}>
      <Minus size={22} />
    </StepButton>

    <div aria-live="polite" aria-atomic="true" className="flex items-baseline gap-2">
      <span className="text-headline-lg font-bold text-ink tabular-nums">{value}</span>
      <span className="text-copy-muted text-body">{label}</span>
    </div>

    <StepButton label={increaseLabel} disabled={value >= max} onClick={() => onChange(value + 1)}>
      <Plus size={22} />
    </StepButton>
  </div>
);

export default QuantityStepper;
