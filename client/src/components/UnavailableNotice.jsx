import React from 'react';

// Shown when the code runner cannot run code. `message` is the server's reason in plain words
// (e.g. "Code execution limit for today has been reached. Try again tomorrow. Nothing was scored.").
// It is shown once under a short title; the second sentence only adds what the message does not say.
const UnavailableNotice = ({ message, title = 'Code could not be run' }) => (
  <div role="alert" className="rounded-2xl border border-sun-200 bg-sun-100 p-4 text-sm text-ink">
    <p className="font-semibold">{title}</p>
    <p className="text-ink-2 mt-1">
      {typeof message === 'string' && message
        ? message
        : 'Code execution is currently unavailable, so nothing was scored. Try again in a few minutes.'}
      {' '}Your code is still here, so you can keep editing.
    </p>
  </div>
);

export default UnavailableNotice;
