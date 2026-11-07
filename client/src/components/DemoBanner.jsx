import React from 'react';

const DemoBanner = () => {
  if (import.meta.env.VITE_DEMO_BANNER === 'false') return null;
  return (
    <div role="note" className="bg-amber-100 text-amber-900 text-center text-xs py-1 px-2 border-b border-amber-200">
      Demo environment - use fake data only
    </div>
  );
};

export default DemoBanner;
