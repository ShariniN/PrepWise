import React, { useMemo, useState } from 'react';
import { fmtOffset, SIGNAL_LABELS } from '../../utils/assessment';

// Series colours are slots 1-3 of the validated categorical palette (blue, orange, aqua).
// Identity is never colour alone: each lane has a text label and its own mark shape.
const COLORS = { editing: '#2a78d6', integrity: '#eb6834', attempt: '#1baf7a', technical: '#8a8984', ink: '#52514e', grid: '#e4e3df' };
const W = 900;
const LEFT = 110;
const RIGHT = 20;
const LANES = [
  { key: 'session', label: 'Session', y: 24 },
  { key: 'integrity', label: 'Page and clipboard', y: 62 },
  { key: 'editing', label: 'Editing', y: 100 },
  { key: 'attempt', label: 'Run / submit', y: 138 },
];
const H = 190;

const describe = (it) => {
  const q = it.questionId ? ` (question ${String(it.questionId).slice(-4)})` : '';
  if (it.kind === 'session') return `Session ${it.type}`;
  if (it.kind === 'integrity') {
    const base = SIGNAL_LABELS[it.type] || it.type;
    const extra = [it.len ? `${it.len} characters` : '', it.inEditor === false ? 'outside the editor' : '', it.technical ? 'technical, not counted' : ''].filter(Boolean).join(', ');
    return `${base}${extra ? ` - ${extra}` : ''}${q}`;
  }
  if (it.kind === 'editing') return `Editing: ${it.inserted} inserted, ${it.deleted} deleted, ${it.pasteCount} paste${it.pasteCount === 1 ? '' : 's'} (${it.pasted} characters pasted)${q}`;
  if (it.kind === 'attempt') return `${it.type === 'submit' ? 'Submitted' : 'Ran'} ${it.language || ''}${it.verdict ? `, ${String(it.verdict).replace(/_/g, ' ')}` : ''}${q}`;
  return it.kind;
};

const CaseTimeline = ({ items, truncated }) => {
  const [active, setActive] = useState(null);
  const model = useMemo(() => {
    const max = Math.max(1000, ...items.map((i) => (i.until ?? i.at) || 0));
    const x = (t) => LEFT + ((t || 0) / max) * (W - LEFT - RIGHT);
    const ticks = Array.from({ length: 6 }, (_, i) => Math.round((max / 5) * i));
    return { max, x, ticks };
  }, [items]);
  const { x, ticks } = model;
  const lane = (k) => LANES.find((l) => l.key === k).y;

  const mark = (it, i) => {
    const common = {
      key: i, tabIndex: 0, role: 'img', 'aria-label': `${fmtOffset(it.at)} ${describe(it)}`,
      onMouseEnter: () => setActive(it), onFocus: () => setActive(it), onMouseLeave: () => setActive(null), onBlur: () => setActive(null),
      style: { cursor: 'pointer', outline: 'none' },
    };
    if (it.kind === 'session') {
      return <line {...common} x1={x(it.at)} x2={x(it.at)} y1={8} y2={H - 30} stroke={COLORS.ink} strokeWidth={it.type === 'deadline' ? 1.5 : 1} strokeDasharray={it.type === 'deadline' ? '4 3' : undefined} />;
    }
    if (it.kind === 'integrity') {
      const c = it.technical ? COLORS.technical : COLORS.integrity;
      const big = it.type === 'paste' && (it.len || 0) >= 500;
      return <circle {...common} cx={x(it.at)} cy={lane('integrity')} r={big ? 7 : 5} fill={it.technical ? 'none' : c} stroke={it.technical ? c : 'var(--surface, #fff)'} strokeWidth={it.technical ? 2 : 2} />;
    }
    if (it.kind === 'editing') {
      const x1 = x(it.at); const x2 = Math.max(x(it.until ?? it.at), x1 + 3);
      return <rect {...common} x={x1} y={lane('editing') - 7} width={x2 - x1} height={14} rx={3} fill={COLORS.editing} fillOpacity={it.pasteCount ? 1 : 0.55} stroke="var(--surface, #fff)" strokeWidth={1} />;
    }
    const cx = x(it.at); const cy = lane('attempt');
    return <path {...common} d={`M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z`} fill={it.type === 'submit' ? COLORS.attempt : '#fff'} stroke={COLORS.attempt} strokeWidth={2} />;
  };

  return (
    <div className="space-y-2">
      <div className="viz-root overflow-x-auto rounded-2xl border border-line bg-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[640px]" role="group" aria-label="Session timeline">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={8} y2={H - 30} stroke={COLORS.grid} />
            <text x={x(t)} y={H - 12} fontSize="11" textAnchor="middle" fill={COLORS.ink}>{fmtOffset(t)}</text>
          </g>
        ))}
        {LANES.map((l) => (
          <g key={l.key}>
            <line x1={LEFT} x2={W - RIGHT} y1={l.y} y2={l.y} stroke={COLORS.grid} />
            <text x={4} y={l.y + 4} fontSize="12" fill={COLORS.ink}>{l.label}</text>
          </g>
        ))}
        {items.map((it, i) => (it.kind === 'editing' ? null : mark(it, i)))}
        {items.map((it, i) => (it.kind === 'editing' ? mark(it, i) : null))}
      </svg></div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
        <li><span style={{ background: COLORS.integrity }} className="inline-block w-2.5 h-2.5 rounded-full mr-1" />Page / clipboard event (larger = paste of 500+ characters)</li>
        <li><span style={{ borderColor: COLORS.technical }} className="inline-block w-2.5 h-2.5 rounded-full mr-1 border-2" />Technical (connection), never a reason</li>
        <li><span style={{ background: COLORS.editing }} className="inline-block w-3 h-2.5 rounded-sm mr-1" />Editing batch (solid = contains a paste)</li>
        <li><span style={{ borderColor: COLORS.attempt }} className="inline-block w-2.5 h-2.5 rotate-45 mr-1 border-2" />Run (hollow) or submit (filled)</li>
        <li>Dashed line: deadline</li>
      </ul>
      <p className="min-h-[1.25rem] text-sm text-ink" aria-live="polite">
        {active ? `${fmtOffset(active.at)} - ${describe(active)}` : 'Hover or focus a mark for details.'}
      </p>
      {truncated && <p className="text-xs text-sun-700">The timeline was cut at 3,000 items; very early or late activity may be missing.</p>}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-primary-700">Table view</summary>
        <div className="max-h-64 overflow-auto mt-2">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-ink-2"><th className="pr-3">Time</th><th>What</th></tr></thead>
            <tbody>
              {items.map((it, i) => (<tr key={i} className="border-t border-line"><td className="pr-3 font-mono">{fmtOffset(it.at)}</td><td>{describe(it)}</td></tr>))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};

export default CaseTimeline;
