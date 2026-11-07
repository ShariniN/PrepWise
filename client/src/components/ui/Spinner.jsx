import React from 'react';
import { cn } from './cn';

const Spinner = ({ size = 20, className, label }) => (
  <span role={label ? 'status' : undefined} aria-label={label} className={cn('inline-flex', className)}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </span>
);

export default Spinner;
