import React from 'react';
import { cn } from './cn';

const VARIANTS = {
  card: 'section-card',
  sand: 'section-sand',
  ink: 'section-ink',
  plain: '',
};

/** Large rounded content block. variant: card|sand|ink|plain. Optional eyebrow/title/lead header. */
const Section = ({ variant = 'card', eyebrow, title, lead, align = 'left', className, children, ...rest }) => (
  <section className={cn(VARIANTS[variant], className)} {...rest}>
    {(eyebrow || title || lead) && (
      <header className={cn('mb-8 max-w-3xl sm:mb-12', align === 'center' && 'mx-auto text-center')}>
        {eyebrow && <p className={cn('eyebrow mb-3', variant === 'ink' && '!text-sun-300')}>{eyebrow}</p>}
        {title && <h2 className={cn('font-display text-3xl font-semibold leading-[1.05] sm:text-5xl text-balance', variant === 'ink' ? 'text-white' : 'text-ink')}>{title}</h2>}
        {lead && <p className={cn('mt-4 text-base sm:text-lg', variant === 'ink' ? 'text-white/75' : 'text-ink-2')}>{lead}</p>}
      </header>
    )}
    {children}
  </section>
);

export default Section;
