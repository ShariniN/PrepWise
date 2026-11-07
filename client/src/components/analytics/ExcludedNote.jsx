import React from 'react';
import { Info } from 'lucide-react';

// "N items not counted" for fallback / unconfirmed-AI scores. Accepts a number or an object of counts.
const ExcludedNote = ({ excluded, note }) => {
  const count = typeof excluded === 'number'
    ? excluded
    : Object.values(excluded || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <p className="flex gap-2 items-start text-xs text-gray-500">
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        {count} item{count === 1 ? '' : 's'} not counted (fallback or unconfirmed AI scores are left out of every figure).
        {note ? ` ${note}` : ''}
      </span>
    </p>
  );
};

export default ExcludedNote;
