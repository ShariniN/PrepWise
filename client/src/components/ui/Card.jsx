import React from 'react';
import { cn } from './cn';

const TONES = {
  surface: 'bg-surface border border-line shadow-soft',
  sand: 'bg-sand border border-transparent',
  primary: 'bg-primary-50 border border-primary-100',
  ink: 'bg-ink-deep text-white border border-white/10',
};

/** Rounded-3xl surface. Props: tone (surface|sand|primary|ink), padded (default true), lift (hover raise). */
const Card = React.forwardRef(function Card({ as: Tag = 'div', tone = 'surface', padded = true, lift = false, className, ...rest }, ref) {
  return (
    <Tag
      ref={ref}
      className={cn('rounded-3xl', TONES[tone], padded && 'p-5 sm:p-6', lift && 'transition duration-300 ease-out hover:-translate-y-1 hover:shadow-card', className)}
      {...rest}
    />
  );
});

export const CardTitle = ({ children, action, className }) => (
  <div className={cn('mb-4 flex items-center justify-between gap-3', className)}>
    <h3 className="font-display text-lg font-semibold text-ink">{children}</h3>
    {action}
  </div>
);

export default Card;
