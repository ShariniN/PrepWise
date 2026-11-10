import React from 'react';
import { Activity, ShieldCheck, Lightbulb } from 'lucide-react';
import { Badge } from '../ui';
import { summariseDelivery, deliveryTips, PRIVACY_NOTE } from '../../utils/coachingMetrics';
import { DeliveryMetricsGrid } from './DeliveryCard';

/** Delivery summary across all answers, for the final interview report. */
export default function DeliverySummary({ metricsList }) {
  const s = summariseDelivery(metricsList);
  if (s.answersWithCamera === 0 && s.answersWithSpeech === 0 && s.fillerWordCount === null) return null;
  const tips = deliveryTips(s, { max: 4 });

  return (
    <section className="mb-8 rounded-3xl border border-line bg-surface p-6 shadow-soft" aria-labelledby="delivery-summary-title" data-testid="delivery-summary">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="delivery-summary-title" className="flex items-center gap-2 text-xl font-bold text-ink">
          <Activity className="h-5 w-5 text-primary-600" aria-hidden="true" />
          Delivery
        </h2>
        <Badge tone="primary">Coaching only, not part of your score</Badge>
      </div>
      <p className="mb-4 text-sm text-ink-2">
        {s.answersWithCamera > 0
          ? `Camera coaching was on for ${s.answersWithCamera} of ${s.answers} answers.`
          : 'Camera coaching was off, so this covers how you spoke.'}{' '}
        Eye contact here means facing the camera (head direction), not exact eye tracking.
      </p>

      <DeliveryMetricsGrid m={s} cameraUsed={s.answersWithCamera > 0} />

      {tips.length > 0 && (
        <div className="mt-4 rounded-2xl bg-primary-50 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-900">
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> Tips for next time
          </h3>
          <ul className="space-y-1.5 text-sm text-ink-2">
            {tips.map((t) => (
              <li key={t} className="flex gap-2"><span aria-hidden="true">•</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {PRIVACY_NOTE}
      </p>
    </section>
  );
}
