import React from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { Badge, ProgressBar } from '../ui';
import { deliveryTips, paceLabel, PACE_TARGET, PRIVACY_NOTE } from '../../utils/coachingMetrics';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const MOVEMENT = {
  low: { label: 'Calm', tone: 'success' },
  medium: { label: 'Some', tone: 'neutral' },
  high: { label: 'A lot', tone: 'warning' },
};
const PACE = {
  good: { label: 'Good pace', tone: 'success' },
  fast: { label: 'A bit fast', tone: 'warning' },
  slow: { label: 'A bit slow', tone: 'warning' },
};

function Metric({ label, children, hint }) {
  return (
    <div className="rounded-xl bg-surface p-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{children}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-muted">{hint}</div>}
    </div>
  );
}

/** The camera and speech numbers as metric tiles. Shared by the per-answer card and the summary. */
export function DeliveryMetricsGrid({ m, fillerBreakdown, cameraUsed }) {
  const pace = paceLabel(m.wordsPerMinute);
  const noFace = cameraUsed && m.faceVisiblePct === 0;
  const topFillers = fillerBreakdown
    ? Object.entries(fillerBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, n]) => `"${w}" ${n}`).join(', ')
    : '';

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cameraUsed && (
        <>
          <Metric label="Eye contact" hint={noFace ? 'No face detected' : 'Facing the camera'}>
            {isNum(m.eyeContactPct) ? (
              <>
                {Math.round(m.eyeContactPct)}%
                <ProgressBar value={m.eyeContactPct} size="sm" tone={m.eyeContactPct >= 60 ? 'success' : 'warning'} label="Eye contact" className="mt-1" />
              </>
            ) : (
              <span className="text-ink-2">Not measured</span>
            )}
          </Metric>
          <Metric label="Looked away" hint="1.5 s or longer">
            {isNum(m.lookAwayCount) ? `${m.lookAwayCount} ${m.lookAwayCount === 1 ? 'time' : 'times'}` : <span className="text-ink-2">-</span>}
          </Metric>
          <Metric label="Head movement">
            {m.headMovement ? <Badge tone={MOVEMENT[m.headMovement].tone}>{MOVEMENT[m.headMovement].label}</Badge> : <span className="text-ink-2">-</span>}
          </Metric>
          <Metric label="Face in view">
            {isNum(m.faceVisiblePct) ? `${Math.round(m.faceVisiblePct)}%` : <span className="text-ink-2">-</span>}
          </Metric>
        </>
      )}
      <Metric label="Pace" hint={`Aim for ${PACE_TARGET.min}-${PACE_TARGET.max} wpm`}>
        {isNum(m.wordsPerMinute) ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {m.wordsPerMinute} wpm {pace && <Badge tone={PACE[pace].tone}>{PACE[pace].label}</Badge>}
          </span>
        ) : (
          <span className="text-ink-2">Spoken answers only</span>
        )}
      </Metric>
      <Metric label="Filler words" hint={topFillers || undefined}>
        {isNum(m.fillerWordCount) ? m.fillerWordCount : <span className="text-ink-2">Spoken answers only</span>}
      </Metric>
    </div>
  );
}

/**
 * Per-answer "Delivery" card. `metrics` is the deliveryMetrics object stored with the answer;
 * `fillerBreakdown` (optional, kept in the browser only) names the most used fillers.
 */
export default function DeliveryCard({ metrics, fillerBreakdown }) {
  if (!metrics) return null;
  const m = metrics;
  const hasSpeech = isNum(m.wordsPerMinute) || isNum(m.fillerWordCount);
  if (!m.cameraUsed && !hasSpeech) return null;
  const tips = deliveryTips(m, { max: 2 });

  return (
    <section className="mt-3 rounded-2xl border border-line bg-sand p-3" aria-label="Delivery" data-testid="delivery-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h5 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Activity className="h-3.5 w-3.5 text-primary-600" aria-hidden="true" /> Delivery
        </h5>
        <Badge tone="primary">Coaching only</Badge>
      </div>

      <DeliveryMetricsGrid m={m} fillerBreakdown={fillerBreakdown} cameraUsed={m.cameraUsed} />

      {m.cameraUsed && m.faceVisiblePct === 0 && (
        <p className="mt-2 text-xs text-ink-2">
          No face was detected during this answer, so there are no eye contact numbers. Check that your face is in
          the picture and well lit.
        </p>
      )}
      {!m.cameraUsed && <p className="mt-2 text-xs text-ink-2">Camera coaching was off for this answer.</p>}

      {tips.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-ink-2">
          {tips.map((t) => (
            <li key={t} className="flex gap-1.5"><span aria-hidden="true">•</span><span>{t}</span></li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {PRIVACY_NOTE}
      </p>
    </section>
  );
}
