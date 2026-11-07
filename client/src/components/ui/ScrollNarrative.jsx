import React, { useEffect, useRef } from 'react';
import { cn } from './cn';

/**
 * Scroll-linked text: each line starts dim and blurred and sharpens as it rises into the
 * reading zone of the viewport. Lines already read stay sharp. Respects prefers-reduced-motion.
 *   <ScrollNarrative lines={['First line', <>Second <em>line</em></>]} />
 * Lines may be strings or nodes. Wrap highlighted words in <mark className="narr-hl">.
 */
const ScrollNarrative = ({ lines, className, lineClassName }) => {
  const refs = useRef([]);

  useEffect(() => {
    const nodes = refs.current.filter(Boolean);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => { n.style.opacity = 1; n.style.filter = 'none'; n.style.transform = 'none'; });
      return undefined;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      nodes.forEach((n) => {
        const r = n.getBoundingClientRect();
        // 0 when the line is at the bottom edge of the zone, 1 once it has risen ~28% of the viewport.
        const t = Math.max(0, Math.min(1, (vh * 0.82 - r.top) / (vh * 0.28)));
        const e = t * t * (3 - 2 * t);
        n.style.opacity = String(0.14 + 0.86 * e);
        n.style.filter = `blur(${((1 - e) * 9).toFixed(2)}px)`;
        n.style.transform = `translateY(${((1 - e) * 18).toFixed(1)}px) scale(${(0.97 + 0.03 * e).toFixed(3)})`;
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lines]);

  return (
    <div className={cn('space-y-3 sm:space-y-5', className)}>
      {lines.map((l, i) => (
        <p
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={cn('font-display text-3xl font-semibold leading-[1.1] tracking-tight text-ink will-change-[opacity,filter,transform] sm:text-5xl lg:text-6xl', lineClassName)}
        >
          {l}
        </p>
      ))}
    </div>
  );
};

export default ScrollNarrative;
