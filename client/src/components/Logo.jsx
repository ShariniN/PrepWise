import React from 'react';

/** PrepWise mark (rounded star) + wordmark in the display face. `tone="light"` for dark backgrounds. */
const Logo = ({ size = 32, tone = 'dark', wordmark = true, className = '' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#4f46e5" />
      <path d="M20 8.5l3.4 7.1 7.8 1-5.7 5.4 1.5 7.7L20 26l-7 3.7 1.5-7.7-5.7-5.4 7.8-1L20 8.5z" fill="#ffb938" />
    </svg>
    {wordmark && (
      <span className={`font-display text-xl font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink'}`}>
        Prep<span className={tone === 'light' ? 'text-primary-200' : 'text-primary-600'}>Wise</span>
      </span>
    )}
  </span>
);

export default Logo;
