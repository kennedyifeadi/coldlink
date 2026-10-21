import React, { type ReactNode } from 'react';

interface CardTitleProps {
  children: ReactNode;
  aside?: ReactNode;
}

// Wraps the aside onto its own line rather than squeezing the title at narrow widths.
const CardTitle = ({ children, aside }: CardTitleProps) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-4">
    <h2 className="font-heading font-semibold text-ink text-subtitle">{children}</h2>
    {aside && <p className="text-copy-muted text-body">{aside}</p>}
  </div>
);

export default CardTitle;
