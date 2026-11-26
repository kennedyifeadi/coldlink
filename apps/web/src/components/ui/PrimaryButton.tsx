import React, { type ReactNode } from 'react';

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  compact?: boolean;
}

const PrimaryButton = ({
  children,
  onClick,
  type = 'button',
  disabled = false,
  compact = false,
}: PrimaryButtonProps) => {
  const sizeClasses = compact ? 'min-h-12 px-5 text-body' : 'min-h-14 px-6 text-subtitle';
  const stateClasses = disabled
    ? 'bg-surface-sunken text-copy-subtle cursor-not-allowed'
    : 'bg-primary text-white hover:bg-primary-hover active:scale-[0.98]';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center w-full rounded-full font-semibold transition-[background-color,transform] duration-150 ease-out ${sizeClasses} ${stateClasses}`}
    >
      {children}
    </button>
  );
};

export default PrimaryButton;
