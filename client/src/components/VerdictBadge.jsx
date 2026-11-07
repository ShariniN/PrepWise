import React from 'react';

const STYLES = {
  accepted: ['Accepted', 'bg-green-100 text-green-800 border-green-300'],
  wrong_answer: ['Wrong answer', 'bg-red-100 text-red-800 border-red-300'],
  time_limit: ['Time limit exceeded', 'bg-orange-100 text-orange-800 border-orange-300'],
  memory_limit: ['Memory limit exceeded', 'bg-orange-100 text-orange-800 border-orange-300'],
  compile_error: ['Compile error', 'bg-yellow-100 text-yellow-800 border-yellow-300'],
  runtime_error: ['Runtime error', 'bg-red-100 text-red-800 border-red-300'],
  unavailable: ['Execution unavailable', 'bg-gray-200 text-gray-700 border-gray-300'],
  pending_review: ['Pending review', 'bg-blue-100 text-blue-800 border-blue-300'],
};

const VerdictBadge = ({ verdict, size = 'md' }) => {
  if (!verdict) return null;
  const [label, cls] = STYLES[verdict] || [String(verdict).replace(/_/g, ' '), 'bg-gray-100 text-gray-700 border-gray-300'];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return <span className={`inline-block rounded-full border font-semibold ${pad} ${cls}`}>{label}</span>;
};

export default VerdictBadge;
