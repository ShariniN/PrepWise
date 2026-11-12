import React from 'react';
import { Card } from '../../../components/ui';
import { isNum } from '../utils';

// One figure (number or short text); null or empty shows a dash.
const MetricTile = ({ label, value, suffix = '', hint, className }) => {
  let body;
  if (value === null || value === undefined || value === '') {
    body = <p className="mt-1 font-display text-3xl font-semibold text-ink-muted" aria-label="No data">-</p>;
  } else if (isNum(value)) {
    body = <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}{suffix}</p>;
  } else {
    body = <p className="mt-1.5 font-display text-xl font-semibold leading-tight text-ink">{value}{suffix}</p>;
  }
  return (
    <Card className={`!p-4 sm:!p-5 ${className || ''}`}>
      <p className="text-sm font-medium text-ink-2">{label}</p>
      {body}
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </Card>
  );
};

export default MetricTile;
