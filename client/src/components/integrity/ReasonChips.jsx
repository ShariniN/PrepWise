import React from 'react';
import { Badge } from '../ui';
import { REASON_LABELS } from '../../utils/assessment';

// Neutral chips for a case's reason codes. No colour scale: every reason looks the same.
const ReasonChips = ({ codes }) => (
  <span className="flex flex-wrap gap-1.5">
    {(codes || []).map((c) => (
      <Badge key={c} tone="neutral" className="border border-line bg-surface font-medium">
        {REASON_LABELS[c] || c.replace(/_/g, ' ')}
      </Badge>
    ))}
    {(!codes || codes.length === 0) && <span className="text-xs text-ink-2">Technical notes only</span>}
  </span>
);

export default ReasonChips;
