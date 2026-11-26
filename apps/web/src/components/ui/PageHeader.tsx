import React, { type ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  intro?: ReactNode;
  /** Content under the intro and above the rim, such as the search summary chips. */
  children?: ReactNode;
}

// Every screen's heading closes with the green rim, so the eye always finds where content starts.
const PageHeader = ({ title, intro, children }: PageHeaderProps) => (
  <header className="px-5 pt-6 pb-5 rim">
    <h1 className="text-headline-lg font-bold text-ink tracking-tight">{title}</h1>
    {intro && <p className="text-copy-muted text-body mt-1.5">{intro}</p>}
    {children && <div className="mt-4">{children}</div>}
  </header>
);

export default PageHeader;
