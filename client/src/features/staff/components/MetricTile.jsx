import React from 'react';
import { Card } from '../../../components/ui';
import { isNum } from '../utils';

/**
 * One figure with its sample size. `metric` is the API's { average, n }; average is null when fewer than
 * `minimum` students have data, and the tile then says so instead of showing a number.
 * Pass `value` (number or short text) instead of `metric` for plain figures; null shows a dash.
 */
const MetricTile = ({ label, metric, value, suffix = '', hint, unit = 'students', minimum = 5, className }) => {
  let body;
  if (metric) {
    body = isNum(metric.average)
      ? <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink tabular-nums">{metric.average}{suffix}</p>
      : <p className="mt-1.5 font-display text-lg font-semibold text-ink-2">Not enough data</p>;
  } else if (value === null || value === undefined || value === '') {
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
      {metric && (
        <p className="mt-1 text-xs text-ink-2">
          n = {metric.n} {unit}{!isNum(metric.average) && metric.n < minimum ? ` (minimum ${minimum})` : ''}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </Card>
  );
};

export default MetricTile;
