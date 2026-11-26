import React, { type ReactNode } from 'react';

interface CardTitleProps {
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}

// Wraps the aside onto its own line rather than squeezing the title at narrow widths.
const CardTitle = ({ children, aside, id }: CardTitleProps) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
    <h2 id={id} className="font-semibold text-ink text-subtitle">
      {children}
    </h2>
    {aside && <p className="text-copy-muted text-label">{aside}</p>}
  </div>
);

export default CardTitle;
