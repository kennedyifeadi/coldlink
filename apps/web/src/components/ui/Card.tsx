import React, { type ReactNode } from 'react';

type CardTone = 'surface' | 'muted';

interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  className?: string;
}

const toneClasses: Record<CardTone, string> = {
  surface: 'bg-surface shadow-card',
  muted: 'bg-surface-muted',
};

const Card = ({ children, tone = 'surface', className = '' }: CardProps) => (
  <div className={`rounded-2xl border border-line ${toneClasses[tone]} ${className}`}>
    {children}
  </div>
);

export default Card;
