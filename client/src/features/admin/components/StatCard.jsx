import React from 'react';
import { Card } from '../../../components/ui';

const StatCard = ({ label, value, hint }) => (
  <Card className="!p-4 sm:!p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</p>
    <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">{value}</p>
    {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
  </Card>
);

export default StatCard;
