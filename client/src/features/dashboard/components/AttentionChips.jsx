import React from 'react';
import { Badge } from '../../../components/ui';

// Needs-attention flags with the server's plain labels. There is deliberately no combined risk score.
const AttentionChips = ({ reasons, empty = null }) => {
  if (!reasons?.length) return empty;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Things to follow up">
      {reasons.map((r) => (
        <li key={r.code}>
          <Badge tone="neutral" className="whitespace-nowrap font-medium">{r.label || r.code}</Badge>
        </li>
      ))}
    </ul>
  );
};

export default AttentionChips;
