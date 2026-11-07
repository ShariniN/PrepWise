import React, { useState } from 'react';

// Shared "chart / table" toggle so every graphic has a screen-reader friendly table view.
export const ViewToggle = ({ table, onChange }) => (
  <button type="button" onClick={() => onChange(!table)} aria-pressed={table} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-600/20">
    {table ? 'Show chart' : 'Show as table'}
  </button>
);

const fmt = (v, suffix = '') => (v === null || v === undefined ? 'no data' : `${v}${suffix}`);

const Frame = ({ caption, table, setTable, children }) => (
  <div className="viz-root rounded-2xl border border-line p-4" style={{ background: 'var(--viz-surface)', color: 'var(--viz-ink)' }}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="min-w-0 text-sm font-semibold">{caption}</p>
      <ViewToggle table={table} onChange={setTable} />
    </div>
    {children}
  </div>
);

// Horizontal bars. items: [{ label, value, detail? }]; value on a 0-max scale (default 100).
export const BarList = ({ items, suffix = '%', max = 100, caption }) => {
  const [table, setTable] = useState(false);
  return (
    <Frame caption={caption} table={table} setTable={setTable}>
      {table ? (
        <table className="viz-table w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead><tr><th scope="col" className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Item</th><th scope="col" className="px-2 py-1.5 text-right font-semibold">Value</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.label}><td className="border-t border-line px-2 py-1.5">{it.label}</td><td className="border-t border-line px-2 py-1.5 text-right tabular-nums">{fmt(it.value, suffix)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const pct = it.value == null ? 0 : Math.max(0, Math.min(100, (it.value / (it.max || max)) * 100));
            return (
              <li key={it.label}>
                <div className="flex justify-between gap-3 text-xs" style={{ color: 'var(--viz-ink-2)' }}>
                  <span>{it.label}</span>
                  <span>{fmt(it.value, suffix)}{it.detail ? ` (${it.detail})` : ''}</span>
                </div>
                <svg role="img" aria-label={`${it.label}: ${fmt(it.value, suffix)}`} width="100%" height="10" className="block">
                  <rect x="0" y="2" width="100%" height="8" rx="4" fill="var(--viz-grid)" />
                  {pct > 0 && <rect x="0" y="2" width={`${pct}%`} height="8" rx="4" fill="var(--viz-series-1)" />}
                </svg>
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
};

// Column strip over time. points: [{ label, value }].
export const Sparkline = ({ points, caption, height = 60 }) => {
  const [table, setTable] = useState(false);
  const w = 600;
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const bw = w / Math.max(1, points.length);
  return (
    <Frame caption={caption} table={table} setTable={setTable}>
      {table ? (
        <div className="max-h-64 overflow-auto rounded-xl">
          <table className="viz-table w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead><tr><th scope="col" className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Date</th><th scope="col" className="px-2 py-1.5 text-right font-semibold">Value</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.label}><td className="border-t border-line px-2 py-1.5">{p.label}</td><td className="border-t border-line px-2 py-1.5 text-right tabular-nums">{p.value}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <svg role="img" aria-label={`${caption}. ${points.length} days, peak ${maxV}.`} viewBox={`0 0 ${w} ${height}`}
          className="w-full" preserveAspectRatio="none" style={{ height }}>
          <line x1="0" x2={w} y1={height - 0.5} y2={height - 0.5} stroke="var(--viz-grid)" />
          {points.map((p, i) => {
            const h = (p.value / maxV) * (height - 4);
            return (
              <rect key={p.label} x={i * bw + 1} y={height - h} width={Math.max(1, bw - 2)} height={h} rx="2" fill="var(--viz-series-1)">
                <title>{`${p.label}: ${p.value}`}</title>
              </rect>
            );
          })}
        </svg>
      )}
    </Frame>
  );
};

// Sequential 5-step bucket for a 0-100 score.
const bucket = (v) => (v < 20 ? 1 : v < 40 ? 2 : v < 60 ? 3 : v < 80 ? 4 : 5);

// Students x topics heatmap. rows: [{ id, name, values }], columns: [{ topic }].
export const Heatmap = ({ columns, rows, caption }) => {
  const [table, setTable] = useState(false);
  const cell = 44;
  const nameW = 130;
  const headH = 70;
  return (
    <Frame caption={caption} table={table} setTable={setTable}>
      {table ? (
        <div className="overflow-x-auto">
          <table className="viz-table w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr><th scope="col" className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Student</th>{columns.map((c) => <th scope="col" key={c.topic} className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{c.topic}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}><td className="border-t border-line px-2 py-1.5">{r.name}</td>{r.values.map((v, i) => <td key={i} className="border-t border-line px-2 py-1.5 text-right tabular-nums">{fmt(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg role="img"
            aria-label={`${caption}. ${rows.length} students by ${columns.length} topics. Darker is a higher score. Use the table view for exact values.`}
            width={nameW + columns.length * cell} height={headH + rows.length * 26}>
            {columns.map((c, i) => (
              <text key={c.topic} transform={`translate(${nameW + i * cell + cell / 2},${headH - 6}) rotate(-45)`}
                fontSize="11" fill="var(--viz-ink-2)">{c.topic}</text>
            ))}
            {rows.map((r, ri) => (
              <g key={r.id} transform={`translate(0,${headH + ri * 26})`}>
                <text x={nameW - 8} y="16" textAnchor="end" fontSize="11" fill="var(--viz-ink)">
                  {r.name.length > 18 ? `${r.name.slice(0, 17)}...` : r.name}
                </text>
                {r.values.map((v, ci) => {
                  const b = v == null ? 0 : bucket(v);
                  return (
                    <g key={ci}>
                      <rect x={nameW + ci * cell + 1} y="1" width={cell - 2} height="24" rx="3"
                        fill={v == null ? 'var(--viz-null)' : `var(--viz-seq-${b})`}>
                        <title>{`${r.name}, ${columns[ci].topic}: ${fmt(v)}`}</title>
                      </rect>
                      <text x={nameW + ci * cell + cell / 2} y="17" textAnchor="middle" fontSize="11"
                        fill={v == null ? 'var(--viz-muted)' : b <= 2 ? 'var(--viz-on-low)' : 'var(--viz-on-high)'}>
                        {v == null ? '-' : Math.round(v)}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      )}
      {!table && (
        <p className="mt-3 text-xs" style={{ color: 'var(--viz-ink-2)' }}>
          Score 0 to 100 on a single blue ramp. A dash means no eligible score yet.
        </p>
      )}
    </Frame>
  );
};
