import React from 'react';

// Gentle, non-blocking notices shown during an assessment.

export const ReturnedBanner = ({ notice, onDismiss }) => {
  if (!notice) return null;
  const secs = Math.round((notice.ms || 0) / 1000);
  const away = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
  return (
    <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>
        Welcome back. You were away from this page for about {away}. That was recorded, as described before you started.
        Nothing else happens, so carry on with your work.
      </p>
      <button type="button" onClick={onDismiss} className="shrink-0 underline">Dismiss</button>
    </div>
  );
};

export const OfflineBanner = ({ offline, pending }) => {
  if (!offline && !pending) return null;
  return (
    <div role="status" className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
      {offline
        ? 'You appear to be offline. Keep working: your answers are kept on this device and will be sent when the connection returns. Connection problems are not counted against you.'
        : 'Some of your work has not reached the server yet. It will be sent automatically; connection problems are not counted against you.'}
    </div>
  );
};

export const TimeWarning = ({ minutes, onDismiss }) => {
  if (!minutes) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
      <p>About {minutes} minute{minutes === 1 ? '' : 's'} left. Make sure the answers you want marked are submitted.</p>
      {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0 underline">Dismiss</button>}
    </div>
  );
};

export const TimeUpPanel = ({ finished, releaseResults, resultsHref, listHref }) => (
  <div role="alert" className="rounded-2xl bg-white shadow p-6 space-y-3 text-center">
    <h2 className="text-xl font-bold text-gray-800">Time is up</h2>
    <p className="text-sm text-gray-700">
      {finished
        ? 'Your saved answers were submitted. You do not need to do anything else.'
        : 'Your saved answers are being submitted. You do not need to do anything else.'}
    </p>
    <div className="flex justify-center gap-4 text-sm">
      {releaseResults && <a className="text-indigo-700 underline" href={resultsHref}>View results</a>}
      <a className="text-indigo-700 underline" href={listHref}>Back to assessments</a>
    </div>
  </div>
);
