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
                  <title>{`${it.label}: ${fmt(it.value, suffix)}${it.detail ? ` (${it.detail})` : ''}`}</title>
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
