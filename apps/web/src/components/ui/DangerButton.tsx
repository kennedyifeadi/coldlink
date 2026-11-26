import React, { type ReactNode } from 'react';

interface DangerButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** The confirm step of an action that can't be undone, such as cancelling or rejecting. */
const DangerButton = ({ children, onClick, disabled = false }: DangerButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full min-h-12 px-5 rounded-full font-semibold text-body bg-alert-strong text-white hover:bg-alert active:scale-[0.98] disabled:bg-surface-sunken disabled:text-copy-subtle disabled:cursor-not-allowed transition-[background-color,transform] duration-150"
  >
    {children}
  </button>
);

export default DangerButton;
