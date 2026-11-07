import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from './cn';
import Card from './Card';

/** Friendly empty state. icon is a node; action is a Button. */
export const EmptyState = ({ icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center', className)}>
    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary-600">{icon || <Inbox size={24} aria-hidden="true" />}</div>
    <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
    {description && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/** Shimmer placeholder. Size it with className (h-4 w-32 etc). */
export const Skeleton = ({ className, rounded = 'rounded-xl' }) => <div aria-hidden="true" className={cn('skeleton', rounded, className)} />;

export const ProgressBar = ({ value = 0, max = 100, tone = 'primary', size = 'md', label, showValue, className }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = { primary: 'bg-primary-600', success: 'bg-success-500', warning: 'bg-sun-400', danger: 'bg-danger-500' }[tone];
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-2">
          <span>{label}</span>
          {showValue && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || 'Progress'}
        className={cn('w-full overflow-hidden rounded-full bg-sand', size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3.5' : 'h-2.5')}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/** KPI tile. trend: { value: '+4%', tone: 'success'|'danger'|'neutral' } */
export const Stat = ({ label, value, hint, icon, trend, className }) => (
  <Card className={cn('flex flex-col gap-1', className)}>
    <div className="flex items-center justify-between text-sm font-medium text-ink-2">
      <span>{label}</span>
      {icon && <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary-600">{icon}</span>}
    </div>
    <div className="flex items-baseline gap-2">
      <span className="font-display text-4xl font-semibold tracking-tight text-ink">{value}</span>
      {trend && (
        <span className={cn('text-sm font-semibold', trend.tone === 'danger' ? 'text-danger-600' : trend.tone === 'success' ? 'text-success-600' : 'text-ink-muted')}>{trend.value}</span>
      )}
    </div>
    {hint && <p className="text-xs text-ink-muted">{hint}</p>}
  </Card>
);
