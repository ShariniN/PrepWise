import React from 'react';
import { REASON_LABELS } from '../../utils/assessment';

// Neutral chips for a case's reason codes. No colour scale: every reason looks the same.
const ReasonChips = ({ codes }) => (
  <span className="flex flex-wrap gap-1">
    {(codes || []).map((c) => (
      <span key={c} className="text-xs bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5">
        {REASON_LABELS[c] || c.replace(/_/g, ' ')}
      </span>
    ))}
    {(!codes || codes.length === 0) && <span className="text-xs text-gray-500">Technical notes only</span>}
  </span>
);

export default ReasonChips;
