import React, { type ReactNode } from 'react';

interface BottomActionBarProps {
  children: ReactNode;
}

const BottomActionBar = ({ children }: BottomActionBarProps) => (
  <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-5 pt-4 pb-safe-4 bg-surface border-t border-line z-20">
    {children}
  </div>
);

export default BottomActionBar;
