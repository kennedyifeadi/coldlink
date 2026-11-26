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
    className="w-full min-h-12 px-5 font-semibold text-body rounded-full border border-line-strong text-primary-strong transition-colors hover:bg-primary-faint hover:border-primary-muted disabled:text-copy-subtle disabled:border-line disabled:hover:bg-transparent disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

export default TextButton;
