import React, { useState } from 'react';
import { X } from 'lucide-react';

const KEY = 'prepwise.demoBanner.dismissed';
const wasDismissed = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

const DemoBanner = () => {
  const [hidden, setHidden] = useState(wasDismissed);
  if (import.meta.env.VITE_DEMO_BANNER === 'false' || hidden) return null;
  const dismiss = () => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
    setHidden(true);
  };
  return (
    <div role="note" className="relative flex items-center justify-center bg-sun-100 px-10 py-1.5 text-center text-xs font-medium text-sun-700">
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-sun-500" aria-hidden="true" />
      Demo environment - use fake data only
      <button type="button" onClick={dismiss} aria-label="Dismiss demo notice" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full hover:bg-sun-200">
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
};

export default DemoBanner;
