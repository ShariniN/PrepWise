import React from 'react';
import { fmtDuration, isNum } from '../utils';

// Delivery metrics from the camera/voice feature. Two shapes from the API:
//  - cohort (overview): every metric is { average, n } over students, headMovement is { lowPct, mediumPct, highPct, answers }
//  - one student or one interview: cameraUsedPct is a number, metrics are { average, n } over answers,
//    headMovement is { low, medium, high, n } answer counts.
const value = (m, fmt) => (m && isNum(m.average) ? fmt(m.average) : null);

// For a cohort a missing value means too few students; for one student it simply means no recorded value.
const Item = ({ label, text, n, unit, minimum, cohort }) => (
  <div className="rounded-2xl bg-paper p-3.5">
    <dt className="text-xs font-medium text-ink-2">{label}</dt>
    <dd className="m-0 mt-1">
      {text === null
        ? <span className="text-sm font-semibold text-ink-2">{cohort ? 'Not enough data' : 'No data'}</span>
        : <span className="font-display text-xl font-semibold text-ink tabular-nums">{text}</span>}
      {isNum(n) && (
        <span className="block text-xs text-ink-2">n = {n} {unit}{text === null && minimum ? ` (minimum ${minimum})` : ''}</span>
      )}
    </dd>
  </div>
);

const pct = (v) => `${v}%`;
const one = (v) => `${v}`;

const DeliverySummary = ({ delivery, cohort = false }) => {
  if (!delivery) return null;
  const unit = cohort ? 'students' : 'answers';
  const minimum = cohort ? delivery.minimum : undefined;
  const camera = cohort ? value(delivery.cameraUsedPct, pct) : (isNum(delivery.cameraUsedPct) ? pct(delivery.cameraUsedPct) : null);
  const hm = delivery.headMovement;
  let head = null;
  if (hm) {
    if (cohort && isNum(hm.lowPct)) head = `${hm.lowPct}% low, ${hm.mediumPct}% medium, ${hm.highPct}% high`;
    if (!cohort && hm.n > 0) head = `${hm.low} low, ${hm.medium} medium, ${hm.high} high`;
  }

  return (
    <div className="space-y-3">
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Item label="Eye contact" text={value(delivery.eyeContactPct, pct)} n={delivery.eyeContactPct?.n} unit={unit} minimum={minimum} cohort={cohort} />
        <Item label="Speaking pace" text={value(delivery.wordsPerMinute, (v) => `${v} wpm`)} n={delivery.wordsPerMinute?.n} unit={unit} minimum={minimum} cohort={cohort} />
        <Item label="Filler words per answer" text={value(delivery.fillerWordCount, one)} n={delivery.fillerWordCount?.n} unit={unit} minimum={minimum} cohort={cohort} />
      </dl>
      <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item label={cohort ? 'Answers with camera on' : 'Camera on'} text={camera} n={cohort ? delivery.cameraUsedPct?.n : delivery.answers} unit={unit} minimum={minimum} cohort={cohort} />
        <Item label="Face visible" text={value(delivery.faceVisiblePct, pct)} n={delivery.faceVisiblePct?.n} unit={unit} minimum={minimum} cohort={cohort} />
        <Item label="Look-aways per answer" text={value(delivery.lookAwayCount, one)} n={delivery.lookAwayCount?.n} unit={unit} minimum={minimum} cohort={cohort} />
        <Item label="Answer length" text={value(delivery.durationSec, fmtDuration)} n={delivery.durationSec?.n} unit={unit} minimum={minimum} cohort={cohort} />
      </dl>
      <p className="text-sm text-ink-2">
        <span className="font-medium text-ink">Head movement: </span>
        {head || (cohort ? 'not enough data' : 'no data')}
        {cohort && hm && isNum(hm.answers) ? ` (${hm.answers} camera answers)` : ''}
      </p>
    </div>
  );
};

export default DeliverySummary;
