import React, { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animates children in (blur + fade + translate + scale) when scrolled into view, once.
 *   <Reveal>..</Reveal>                    single block
 *   <Reveal stagger={90}>{items}</Reveal>  each direct child reveals in sequence
 * Props: as, delay (ms), stagger (ms), threshold, className. Disabled by prefers-reduced-motion.
 * Use sparingly: hero, section headers, grids. Not for dense app tables or forms.
 */
const Reveal = ({ as = 'div', delay = 0, stagger, threshold = 0.15, className, style, children, ...rest }) => {
  const Tag = as;
  const ref = useRef(null);
  const [shown, setShown] = useState(() => reduced() || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, threshold]);

  if (stagger != null) {
    const kids = React.Children.toArray(children);
    return (
      <Tag ref={ref} className={className} style={style} {...rest}>
        {kids.map((child, i) => (
          <div key={child.key ?? i} className={cn('reveal', shown && 'is-in')} style={{ '--reveal-delay': `${delay + i * stagger}ms` }}>
            {child}
          </div>
        ))}
      </Tag>
    );
  }
  return (
    <Tag ref={ref} className={cn('reveal', shown && 'is-in', className)} style={{ '--reveal-delay': `${delay}ms`, ...style }} {...rest}>
      {children}
    </Tag>
  );
};

export default Reveal;
