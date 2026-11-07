import React from 'react';
import { cn } from './cn';

const TONES = {
  neutral: 'bg-sand text-ink-2',
  primary: 'bg-primary-100 text-primary-800',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-sun-100 text-sun-700',
  danger: 'bg-danger-100 text-danger-700',
  dark: 'bg-ink-deep text-white',
};
const DOTS = { neutral: 'bg-ink-muted', primary: 'bg-primary-600', success: 'bg-success-500', warning: 'bg-sun-500', danger: 'bg-danger-500', dark: 'bg-sun-400' };

/** Small pill label. tone: neutral|primary|success|warning|danger|dark. */
export const Badge = ({ tone = 'neutral', dot, icon, className, children }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>
    {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} aria-hidden="true" />}
    {icon}
    {children}
  </span>
);

/** Selectable / removable chip. onClick makes it a toggle (aria-pressed); onRemove adds an x button. */
export const Chip = ({ selected, onClick, onRemove, className, children }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
      selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-surface text-ink-2 hover:border-primary-300',
      className,
    )}
  >
    {onClick ? <button type="button" aria-pressed={!!selected} onClick={onClick} className="rounded-full">{children}</button> : children}
    {onRemove && <button type="button" onClick={onRemove} aria-label="Remove" className="-mr-1 rounded-full px-1 leading-none opacity-70 hover:opacity-100">&times;</button>}
  </span>
);

const STATUS = {
  success: 'success', passed: 'success', pass: 'success', graded: 'success', active: 'success', ready: 'success',
  open: 'primary', pending: 'warning', review: 'warning', flagged: 'warning',
  draft: 'neutral', closed: 'neutral', failed: 'danger', fail: 'danger', error: 'danger',
};

/** Status label with a dot; maps common words to a tone, or pass tone explicitly. */
export const StatusPill = ({ status, tone, children }) => {
  const t = tone || STATUS[String(status || '').toLowerCase()] || 'neutral';
  return <Badge tone={t} dot>{children || status}</Badge>;
};

export default Badge;
