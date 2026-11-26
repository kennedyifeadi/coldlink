import React, { type ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  intro?: ReactNode;
  /** Content under the intro, such as the search summary chips. */
  children?: ReactNode;
}

const PageHeader = ({ title, intro, children }: PageHeaderProps) => (
  <header className="px-5 pt-6 pb-5">
    <h1 className="text-headline-lg font-bold text-ink tracking-tight">{title}</h1>
    {intro && <p className="text-copy-muted text-body mt-1.5">{intro}</p>}
    {children && <div className="mt-4">{children}</div>}
  </header>
);

export default PageHeader;
