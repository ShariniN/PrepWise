import React from 'react';
import { fmtOffset, SIGNAL_LABELS, REASON_LABELS } from '../../utils/assessment';

const evidenceLine = (e) => {
  if (e.kind === 'integrity_event') {
    const dur = e.durationMs ? `, lasted ${Math.round(e.durationMs / 1000)} s` : '';
    return `${fmtOffset(e.at)} ${SIGNAL_LABELS[e.type] || e.type}${dur}`;
  }
  if (e.kind === 'edit_batch') return `${fmtOffset(e.at)} edit batch${e.type ? ` (${e.type})` : ''}`;
  if (e.kind === 'similarity_pair') return `Similarity pair${e.containment != null ? `, ${Math.round(e.containment * 100)}% of the shorter submission matches` : ''}`;
  return e.kind;
};

// Each reason in the server's own words, with the measured value and the evidence behind it.
const ReasonList = ({ reasons, technical }) => (
  <div className="space-y-3">
    {reasons.length === 0 && <p className="text-sm text-gray-600">No reasons were listed for this session.</p>}
    {reasons.map((r, i) => (
      <article key={`${r.code}-${i}`} className="border border-slate-200 rounded-lg p-3 space-y-1">
        <h3 className="text-sm font-semibold text-gray-800">
          {REASON_LABELS[r.code] || r.code}
          {(r.code === 'devtools_hint' || r.code === 'multiple_screens_hint') && <span className="ml-2 text-xs font-normal text-gray-500">low confidence</span>}
        </h3>
        <p className="text-sm text-gray-700">{r.text}</p>
        {r.threshold && <p className="text-xs text-gray-500">Shown because of: {Object.entries(r.threshold).map(([k, v]) => `${k} ${v}`).join(', ')}</p>}
        {(r.evidence || []).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-indigo-700">Evidence ({r.evidence.length})</summary>
            <ul className="mt-1 list-disc pl-5 space-y-0.5 text-gray-700">
              {r.evidence.map((e, j) => <li key={j}>{evidenceLine(e)}</li>)}
            </ul>
          </details>
        )}
      </article>
    ))}
    {technical && (technical.offlineCount > 0 || technical.note) && (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Technical notes (not a reason)</p>
        <p>{technical.note || `The connection dropped ${technical.offlineCount} time${technical.offlineCount === 1 ? '' : 's'}${technical.offlineMs ? `, about ${Math.round(technical.offlineMs / 1000)} s in total` : ''}.`}</p>
      </div>
    )}
  </div>
);

export default ReasonList;
