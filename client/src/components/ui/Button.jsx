import React from 'react';
import { cn } from './cn';
import Spinner from './Spinner';

const VARIANTS = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-[0_8px_20px_-8px_rgb(79_70_229/0.7)]',
  secondary: 'bg-surface text-ink border border-line hover:border-primary-300 hover:bg-primary-50 shadow-soft',
  ghost: 'bg-transparent text-ink-2 hover:bg-sand hover:text-ink',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-[0_8px_20px_-8px_rgb(229_72_77/0.7)]',
  dark: 'bg-ink-deep text-white hover:bg-primary-900 shadow-soft',
  sun: 'bg-sun-400 text-ink-deep hover:bg-sun-300 shadow-soft',
};
const SIZES = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-6 text-sm gap-2',
  lg: 'h-14 px-8 text-base gap-2.5',
};

/**
 * Pill button. `as` lets you render a router Link or an anchor: <Button as={Link} to="/x">.
 * Props: variant (primary|secondary|ghost|danger|dark|sun), size (sm|md|lg), loading,
 * icon (leading node), iconRight (trailing node), block.
 */
const Button = React.forwardRef(function Button(
  { as: Tag = 'button', variant = 'primary', size = 'md', loading = false, icon, iconRight, block, className, children, disabled, type, ...rest },
  ref,
) {
  const isButton = Tag === 'button';
  return (
    <Tag
      ref={ref}
      type={isButton ? type || 'button' : undefined}
      disabled={isButton ? disabled || loading : undefined}
      aria-disabled={!isButton && (disabled || loading) ? true : undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold no-underline',
        'transition duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
      {!loading && iconRight}
    </Tag>
  );
});

export default Button;
