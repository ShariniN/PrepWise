import React from 'react';

const StatCard = ({ label, value, hint }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
    <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

export default StatCard;
