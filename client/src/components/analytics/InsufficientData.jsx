import React from 'react';
import { ShieldAlert } from 'lucide-react';

// Shown instead of any percentage when the API returns insufficientData.
const InsufficientData = ({ n, minimum, notice }) => (
  <div className="flex gap-2 items-start rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
    <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div>
      <p className="font-semibold">Insufficient data (n = {n}, minimum {minimum})</p>
      {notice && <p>{notice}</p>}
    </div>
  </div>
);

export default InsufficientData;
