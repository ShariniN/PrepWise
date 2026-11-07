import React from 'react';
import { cn } from './cn';

/** Endless horizontal ticker of text/nodes. Pauses on hover; static under reduced motion. */
const Marquee = ({ items, className, itemClassName }) => (
  <div className={cn('group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]', className)}>
    <div className="flex w-max animate-marquee gap-3 group-hover:[animation-play-state:paused]">
      {[...items, ...items].map((it, i) => (
        <span key={i} aria-hidden={i >= items.length || undefined} className={cn('whitespace-nowrap rounded-full border border-line bg-surface px-5 py-2 text-sm font-medium text-ink-2', itemClassName)}>
          {it}
        </span>
      ))}
    </div>
  </div>
);

export default Marquee;
