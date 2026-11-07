import React, { useId } from 'react';
import { cn } from './cn';

const control = 'w-full rounded-2xl border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted transition focus:outline-none focus:ring-4 focus:ring-primary-600/15 disabled:cursor-not-allowed disabled:bg-sand disabled:opacity-70';
const okBorder = 'border-line hover:border-primary-300 focus:border-primary-600';
const errBorder = 'border-danger-500 focus:border-danger-500';

/**
 * Label + control + hint/error wrapper. Children is a render function that receives the props
 * to spread onto the control:  <Field label="Email" error={e}>{(p) => <Input {...p} />}</Field>
 */
export const Field = ({ label, hint, error, required, className, children }) => {
  const id = useId();
  const descId = hint || error ? `${id}-d` : undefined;
  const props = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': descId, error: !!error };
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}{required && <span className="text-danger-600" aria-hidden="true"> *</span>}
        </label>
      )}
      {typeof children === 'function' ? children(props) : children}
      {(hint || error) && (
        <p id={descId} role={error ? 'alert' : undefined} className={cn('mt-1.5 text-xs', error ? 'text-danger-600' : 'text-ink-muted')}>{error || hint}</p>
      )}
    </div>
  );
};

export const Input = React.forwardRef(function Input({ error, icon, className, ...rest }, ref) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">{icon}</span>
        <input ref={ref} className={cn(control, 'pl-11', error ? errBorder : okBorder, className)} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={cn(control, error ? errBorder : okBorder, className)} {...rest} />;
});

export const Textarea = React.forwardRef(function Textarea({ error, className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'rounded-3xl', error ? errBorder : okBorder, className)} {...rest} />;
});

const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2362607a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")";

export const Select = React.forwardRef(function Select({ error, className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(control, 'appearance-none bg-no-repeat pr-10', error ? errBorder : okBorder, className)}
      style={{ backgroundImage: CHEVRON, backgroundPosition: 'right 1rem center' }}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Field;
