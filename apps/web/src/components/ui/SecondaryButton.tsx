import React, { type ReactNode } from 'react';

interface SecondaryButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** An outlined button for the action beside the primary one. */
const SecondaryButton = ({ children, onClick, disabled = false }: SecondaryButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full min-h-12 px-5 rounded-full font-semibold text-body border border-line-strong text-ink hover:bg-surface-muted active:scale-[0.98] disabled:text-copy-subtle disabled:cursor-not-allowed disabled:active:scale-100 transition-[background-color,transform] duration-150"
  >
    {children}
  </button>
);

export default SecondaryButton;
