import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const TESTS = ['returns [0, 1] for the basic case', 'handles duplicates', 'handles negative numbers', 'runs in O(n) on 10k items'];

const HEAT = [
  [3, 4, 4, 2, 4, 3, 4],
  [4, 3, 2, 4, 4, 1, 3],
  [2, 4, 4, 3, 1, 4, 4],
  [4, 2, 3, 4, 4, 3, 2],
  [3, 4, 1, 3, 4, 4, 3],
];
const HEAT_CLS = ['bg-sand', 'bg-sun-300', 'bg-primary-200', 'bg-primary-400', 'bg-primary-600'];

const useCycle = (steps, ms) => {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduce ? steps - 2 : 0);
  useEffect(() => {
    if (reduce) return undefined;
    const id = setInterval(() => setN((v) => (v + 1) % steps), ms);
    return () => clearInterval(id);
  }, [reduce, steps, ms]);
  return n;
};

export const Gauge = ({ value = 82, size = 128 }) => {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), 400); return () => clearTimeout(t); }, [value]);
  const r = 48;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Readiness ${value} out of 100`}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e0e7ff" strokeWidth="11" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#g)" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)' }} />
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f46e5" /><stop offset="1" stopColor="#ffb938" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className="font-display text-3xl font-bold leading-none text-ink">{value}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Ready</div></div>
      </div>
    </div>
  );
};

export const Heatmap = ({ className = '' }) => (
  <div className={`grid grid-cols-7 gap-1.5 ${className}`} aria-hidden="true">
    {HEAT.flat().map((v, i) => <span key={i} className={`aspect-square rounded-md ${HEAT_CLS[v]}`} />)}
  </div>
);

/** Pure CSS/SVG hero illustration: stacked glass cards (editor with ticking tests, readiness gauge, cohort heatmap). */
const HeroVisual = () => {
  const n = useCycle(7, 900);
  const passed = Math.min(n, TESTS.length);
  return (
    <div className="relative mx-auto h-[26rem] w-full max-w-[34rem] sm:h-[30rem]" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-full bg-primary-200/40 blur-3xl" />

      {/* Editor */}
      <div className="absolute left-0 top-4 w-[88%] animate-float-slow overflow-hidden rounded-3xl bg-ink-deep shadow-float ring-1 ring-white/10 sm:w-[84%]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-danger-500/80" /><span className="h-2.5 w-2.5 rounded-full bg-sun-400/90" /><span className="h-2.5 w-2.5 rounded-full bg-success-500/80" />
          <span className="ml-3 text-xs text-white/50">two_sum.py</span>
        </div>
        <pre className="m-0 overflow-hidden px-4 py-3 font-mono text-[11px] leading-5 text-white/80 sm:text-xs">
<span className="text-primary-300">def</span> <span className="text-sun-300">two_sum</span>(nums, target):{'\n'}
{'    '}seen = {'{}'}{'\n'}
{'    '}<span className="text-primary-300">for</span> i, x <span className="text-primary-300">in</span> <span className="text-sun-300">enumerate</span>(nums):{'\n'}
{'        '}<span className="text-primary-300">if</span> target - x <span className="text-primary-300">in</span> seen:{'\n'}
{'            '}<span className="text-primary-300">return</span> [seen[target - x], i]{'\n'}
{'        '}seen[x] = i
        </pre>
        <ul className="m-0 list-none space-y-1.5 border-t border-white/10 bg-white/5 px-4 py-3 text-[11px] sm:text-xs">
          {TESTS.map((t, i) => (
            <li key={t} className="flex items-center gap-2 text-white/80">
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors duration-300 ${i < passed ? 'bg-success-500 text-white' : i === passed ? 'bg-sun-400/30' : 'bg-white/10'}`}>
                {i < passed ? <Check size={10} strokeWidth={3} /> : i === passed ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sun-400" /> : null}
              </span>
              <span className={i < passed ? 'text-white' : 'text-white/50'}>{t}</span>
            </li>
          ))}
          <li className="pt-1 text-white/60">{passed}/{TESTS.length} hidden tests passing</li>
        </ul>
      </div>

      {/* Gauge */}
      <div className="glass absolute -right-1 top-0 animate-float rounded-3xl p-4 sm:right-0">
        <Gauge value={82} size={112} />
        <p className="mt-1 text-center text-[11px] font-semibold text-ink-2">Readiness</p>
      </div>

      {/* Heatmap */}
      <div className="glass absolute bottom-0 right-2 w-[64%] animate-float-slow rounded-3xl p-4 [animation-delay:-3s] sm:right-6 sm:w-[56%]">
        <div className="mb-2.5 flex items-center justify-between"><span className="text-xs font-semibold text-ink">Cohort heatmap</span><span className="text-[10px] text-ink-muted">35 students</span></div>
        <Heatmap />
      </div>
    </div>
  );
};

export default HeroVisual;
