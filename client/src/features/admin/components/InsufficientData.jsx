import React from 'react';
import { ShieldAlert } from 'lucide-react';

// Shown instead of any percentage when the API returns insufficientData.
const InsufficientData = ({ n, minimum, notice }) => (
  <div className="flex items-start gap-2.5 rounded-2xl border border-sun-200 bg-sun-50 p-3.5 text-sm text-ink">
    <ShieldAlert size={16} className="mt-0.5 shrink-0 text-sun-700" aria-hidden="true" />
    <div>
      <p className="font-semibold">Insufficient data (n = {n}, minimum {minimum})</p>
      {notice && <p className="text-ink-2">{notice}</p>}
    </div>
  </div>
);

export default InsufficientData;
