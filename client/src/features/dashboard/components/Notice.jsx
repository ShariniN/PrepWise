import React from 'react';
import { Eye, Info } from 'lucide-react';

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
