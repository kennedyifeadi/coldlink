import React, { type ReactNode } from 'react';

interface TextButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

const TextButton = ({ children, onClick, disabled = false }: TextButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full min-h-12 py-3 font-medium text-lead rounded-lg transition-colors text-primary-strong hover:bg-surface-muted disabled:text-copy-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

export default TextButton;
