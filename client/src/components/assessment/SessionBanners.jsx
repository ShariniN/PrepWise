import React from 'react';
import { Button, Card } from '../ui';

// Gentle, non-blocking notices shown during an assessment.

const Banner = ({ tone, role = 'status', children, onDismiss }) => {
  const tones = {
    sun: 'border-sun-300 bg-sun-50 text-ink',
    info: 'border-primary-200 bg-primary-50 text-ink',
  };
  return (
    <div role={role} className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-sm ${tones[tone]}`}>
      <p>{children}</p>
      {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0 font-semibold text-ink-2 underline hover:text-ink">Dismiss</button>}
    </div>
  );
};

export const ReturnedBanner = ({ notice, onDismiss }) => {
  if (!notice) return null;
  const secs = Math.round((notice.ms || 0) / 1000);
  const away = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
  return (
    <Banner tone="sun" onDismiss={onDismiss}>
      Welcome back. You were away from this page for about {away}. That was recorded, as described before you started.
      Nothing else happens, so carry on with your work.
    </Banner>
  );
};

export const OfflineBanner = ({ offline, pending }) => {
  if (!offline && !pending) return null;
  return (
    <Banner tone="info">
      {offline
        ? 'You appear to be offline. Keep working: your answers are kept on this device and will be sent when the connection returns. Connection problems are not counted against you.'
        : 'Some of your work has not reached the server yet. It will be sent automatically; connection problems are not counted against you.'}
    </Banner>
  );
};

export const TimeWarning = ({ minutes, onDismiss }) => {
  if (!minutes) return null;
  return (
    <Banner tone="sun" role="alert" onDismiss={onDismiss}>
      About {minutes} minute{minutes === 1 ? '' : 's'} left. Make sure the answers you want marked are submitted.
    </Banner>
  );
};

export const TimeUpPanel = ({ finished, releaseResults, resultsHref, listHref }) => (
  <Card role="alert" className="mx-auto max-w-xl space-y-3 text-center">
    <h2 className="font-display text-2xl font-semibold text-ink">Time is up</h2>
    <p className="text-sm text-ink-2">
      {finished
        ? 'Your saved answers were submitted. You do not need to do anything else.'
        : 'Your saved answers are being submitted. You do not need to do anything else.'}
    </p>
    <div className="flex flex-wrap justify-center gap-3 pt-1">
      {releaseResults && <Button as="a" href={resultsHref}>View results</Button>}
      <Button as="a" href={listHref} variant="secondary">Back to assessments</Button>
    </div>
  </Card>
);

