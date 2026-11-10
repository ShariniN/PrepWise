// Formatting helpers for the lecturer dashboard (/staff). The server does all the maths; these only print it.

const DAY_MS = 24 * 60 * 60 * 1000;

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Scores and percentages arrive as 0-100 numbers rounded to 1 decimal, or null.
export const fmtNum = (v, suffix = '') => (isNum(v) ? `${v}${suffix}` : '-');

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

export const daysAgo = (iso) => {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
};

export const fmtLastActive = (iso) => {
  const d = daysAgo(iso);
  if (d === null) return 'No activity yet';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
};

export const fmtDuration = (sec) => {
  if (!isNum(sec)) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m} min ${s} s` : `${s} s`;
};

// Short neutral labels for the needs-attention reasons; the server's full message goes in the tooltip.
export const attentionLabel = (r) => {
  switch (r.code) {
    case 'no_interview': return 'No mock interview';
    case 'no_cv': return 'No CV analysis';
    case 'low_interview_score': return `Interview score ${r.value} (under ${r.threshold})`;
    case 'low_cv_match': return `CV match ${r.value}% (under ${r.threshold}%)`;
    case 'inactive_30_days': return isNum(r.days) ? `Inactive ${r.days} days` : 'No recorded activity';
    default: return r.message || r.code;
  }
};

export const ATTENTION_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'any', label: 'Anything to follow up' },
  { value: 'no_interview', label: 'No mock interview' },
  { value: 'no_cv', label: 'No CV analysis' },
  { value: 'low_interview_score', label: 'Interview score under 50' },
  { value: 'low_cv_match', label: 'CV match under 50%' },
  { value: 'inactive_30_days', label: 'Inactive for 30+ days' },
];

export const CATEGORIES = [
  { key: 'behavioural', label: 'Behavioural' },
  { key: 'technical', label: 'Technical' },
  { key: 'coding', label: 'Coding' },
  { key: 'communication', label: 'Communication' },
];

export const FEEDBACK_SOURCE_LABELS = {
  ai: 'Scored by AI',
  tests: 'Scored by tests',
  human: 'Scored by a person',
  fallback: 'Scored by basic fallback, not counted',
};

export const QUESTION_TYPE_LABELS = {
  behavioral: 'Behavioural',
  technical: 'Technical',
  system_design: 'System design',
  'problem-solving': 'Problem solving',
  coding: 'Coding',
};
