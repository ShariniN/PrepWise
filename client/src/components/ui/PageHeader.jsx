import React from 'react';
import { cn } from './cn';

/** Standard page title block. Every app page should start with one. */
const PageHeader = ({ title, subtitle, eyebrow, actions, className }) => (
  <header className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl text-balance">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-base text-ink-2">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </header>
);

export default PageHeader;
