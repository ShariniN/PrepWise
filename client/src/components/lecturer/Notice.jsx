import React from 'react';
import { Eye, Info, ShieldAlert } from 'lucide-react';

// The API's own notice text (e.g. "Only 3 student(s) have data here..."), shown as returned.
export const DataNotice = ({ notice }) => {
  if (!notice) return null;
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-sun-200 bg-sun-50 p-3.5 text-sm text-ink" role="note">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-sun-700" aria-hidden="true" />
      <span><span className="font-semibold">Insufficient data. </span>{notice}</span>
    </p>
  );
};

// Small grey note, e.g. how many answers were left out of the averages.
export const FootNote = ({ children }) => (
  <p className="flex items-start gap-2 text-xs text-ink-2">
    <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
);

// Shown on every page that opens one student's data (the server writes an audit entry per view).
export const PrivacyNote = () => (
  <p className="mb-6 flex items-center gap-2 rounded-2xl bg-sand px-4 py-2.5 text-sm text-ink-2">
    <Eye size={16} aria-hidden="true" className="shrink-0" />
    Viewing a student&apos;s record is logged.
  </p>
);
