import React from 'react';
import { fmtDuration, isNum } from '../utils';

// Delivery metrics from the camera/voice feature for one student or one interview: cameraUsedPct is a number,
// metrics are { average, n } over answers, headMovement is { low, medium, high, n } answer counts.
const value = (m, fmt) => (m && isNum(m.average) ? fmt(m.average) : null);

const Item = ({ label, text, n }) => (
  <div className="rounded-2xl bg-paper p-3.5">
    <dt className="text-xs font-medium text-ink-2">{label}</dt>
    <dd className="m-0 mt-1">
      {text === null
        ? <span className="text-sm font-semibold text-ink-2">No data</span>
        : <span className="font-display text-xl font-semibold text-ink tabular-nums">{text}</span>}
      {isNum(n) && <span className="block text-xs text-ink-2">n = {n} answers</span>}
    </dd>
  </div>
);

const pct = (v) => `${v}%`;
const one = (v) => `${v}`;

const DeliverySummary = ({ delivery }) => {
  if (!delivery) return null;
  const camera = isNum(delivery.cameraUsedPct) ? pct(delivery.cameraUsedPct) : null;
  const hm = delivery.headMovement;
  const head = hm && hm.n > 0 ? `${hm.low} low, ${hm.medium} medium, ${hm.high} high` : null;

  return (
    <div className="space-y-3">
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Item label="Eye contact" text={value(delivery.eyeContactPct, pct)} n={delivery.eyeContactPct?.n} />
        <Item label="Speaking pace" text={value(delivery.wordsPerMinute, (v) => `${v} wpm`)} n={delivery.wordsPerMinute?.n} />
        <Item label="Filler words per answer" text={value(delivery.fillerWordCount, one)} n={delivery.fillerWordCount?.n} />
      </dl>
      <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item label="Camera on" text={camera} n={delivery.answers} />
        <Item label="Face visible" text={value(delivery.faceVisiblePct, pct)} n={delivery.faceVisiblePct?.n} />
        <Item label="Look-aways per answer" text={value(delivery.lookAwayCount, one)} n={delivery.lookAwayCount?.n} />
        <Item label="Answer length" text={value(delivery.durationSec, fmtDuration)} n={delivery.durationSec?.n} />
      </dl>
      <p className="text-sm text-ink-2">
        <span className="font-medium text-ink">Head movement: </span>
        {head || 'no data'}
      </p>
    </div>
  );
};

export default DeliverySummary;
