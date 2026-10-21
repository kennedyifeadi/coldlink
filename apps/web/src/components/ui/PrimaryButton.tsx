import React, { type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  withArrow?: boolean;
  compact?: boolean;
}

const PrimaryButton = ({
  children,
  onClick,
  type = 'button',
  disabled = false,
  withArrow = false,
  compact = false,
}: PrimaryButtonProps) => {
  const sizeClasses = compact ? 'py-3.5' : 'py-4 text-subtitle';
  const stateClasses = disabled
    ? 'bg-primary-muted text-ink/50 cursor-not-allowed'
    : `bg-primary hover:bg-primary-hover text-ink ${compact ? '' : 'shadow-md'}`;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center justify-center w-full rounded-lg font-medium transition-all ${sizeClasses} ${stateClasses}`}
    >
      <span>{children}</span>
      {withArrow && (
        <ArrowRight
          size={20}
          className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
        />
      )}
    </button>
  );
};

export default PrimaryButton;
