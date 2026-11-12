import React from 'react';

const STYLES = {
  accepted: ['Accepted', 'bg-success-100 text-success-700 border-success-100'],
  wrong_answer: ['Wrong answer', 'bg-danger-100 text-danger-700 border-danger-100'],
  time_limit: ['Time limit exceeded', 'bg-sun-100 text-sun-700 border-sun-200'],
  memory_limit: ['Memory limit exceeded', 'bg-sun-100 text-sun-700 border-sun-200'],
  compile_error: ['Compile error', 'bg-sun-100 text-sun-700 border-sun-200'],
  runtime_error: ['Runtime error', 'bg-danger-100 text-danger-700 border-danger-100'],
  unavailable: ['Execution unavailable', 'bg-sand text-ink-2 border-line'],
  pending_review: ['Pending review', 'bg-primary-100 text-primary-800 border-primary-100'],
};

const VerdictBadge = ({ verdict, size = 'md' }) => {
  if (!verdict) return null;
  const [label, cls] = STYLES[verdict] || [String(verdict).replace(/_/g, ' '), 'bg-sand text-ink-2 border-line'];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return <span className={`inline-block rounded-full border font-semibold ${pad} ${cls}`}>{label}</span>;
};

export default VerdictBadge;
