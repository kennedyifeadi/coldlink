import React, { type ReactNode } from 'react';

type CardTone = 'surface' | 'muted';

interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  className?: string;
  /** The id of the card's heading: the card becomes a section named by it. */
  labelledBy?: string;
}

const toneClasses: Record<CardTone, string> = {
  surface: 'bg-surface border border-line',
  muted: 'bg-surface-muted',
};

const Card = ({ children, tone = 'surface', className = '', labelledBy }: CardProps) => {
  const classes = `rounded-xl ${toneClasses[tone]} ${className}`;

  return labelledBy ? (
    <section aria-labelledby={labelledBy} className={classes}>
      {children}
    </section>
  ) : (
    <div className={classes}>{children}</div>
  );
};

export default Card;
