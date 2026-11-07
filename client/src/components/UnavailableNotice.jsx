import React from 'react';

const UnavailableNotice = ({ message }) => (
  <div role="alert" className="rounded-2xl border border-sun-200 bg-sun-100 p-4 text-sm text-ink">
    <p className="font-semibold">Code execution is currently unavailable - your work has not been scored.</p>
    <p className="text-ink-2 mt-1">{message || 'You can keep editing; your draft is still saved. Try again in a few minutes.'}</p>
  </div>
);

export default UnavailableNotice;
