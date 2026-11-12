import React from 'react';

// Tiny trend line of the last interview scores (0 to 100, oldest first). One score shows as a dot.
const Sparkline = ({ values, width = 64, height = 22 }) => {
  const pts = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!pts.length) return <span className="text-ink-muted">-</span>;
  const pad = 3;
  const x = (i) => (pts.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (pts.length - 1));
  const y = (v) => pad + ((100 - Math.max(0, Math.min(100, v))) * (height - 2 * pad)) / 100;
  const label = `Last ${pts.length === 1 ? 'score' : `${pts.length} scores`}: ${pts.join(', ')}`;
  return (
    <svg role="img" aria-label={label} width={width} height={height} className="inline-block align-middle">
      <title>{label}</title>
      {pts.length > 1 && (
        <polyline fill="none" stroke="var(--viz-series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      )}
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2.5" fill="var(--viz-series-1)" />
    </svg>
  );
};

export default Sparkline;
