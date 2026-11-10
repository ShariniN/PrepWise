// Pure aggregation functions over plain arrays. No database, no clock (callers pass `now`), so they are
// easy to test with fakes. Every function returns plain JSON-safe objects.
//
// Score eligibility: only submitted attempts with a numeric score whose scoreSource is not 'ai' (unconfirmed
// AI suggestion) or 'fallback' count. Tests-marked and human-confirmed scores count. `excluded` is always returned.

export const MIN_N = 5; // below this many students we return a notice, never averages or percentages
export const DAY_MS = 24 * 60 * 60 * 1000;

const sid = (v) => String(v);
const time = (d) => new Date(d).getTime();
export const round = (n, p = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** p) / 10 ** p);
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const insufficient = (n, extra = {}) => ({
  insufficientData: true, n, minimum: MIN_N,
  notice: `Only ${n} student(s) have data here. At least ${MIN_N} are needed before percentages are shown.`,
  ...extra,
});

const isUnconfirmedAi = (a) => a.runKind === 'submit' && a.needsReview && a.review?.aiSuggestion && !a.review?.final;
export const isScored = (a) => a.runKind === 'submit' && typeof a.score === 'number';
export const isExcluded = (a) =>
  (isScored(a) && (a.scoreSource === 'ai' || a.scoreSource === 'fallback')) || isUnconfirmedAi(a);

// Splits attempts into those usable for analytics and a count of those left out.
export const partitionAttempts = (attempts) => {
  const eligible = [];
  let excluded = 0;
  for (const a of attempts) {
    if (isExcluded(a)) excluded += 1;
    else if (isScored(a)) eligible.push(a);
  }
  return { eligible, excluded };
};

const byTime = (a, b) => time(a.createdAt) - time(b.createdAt) || cmp(sid(a._id ?? ''), sid(b._id ?? ''));

// ---------------------------------------------------------------- admin
// First vs latest scored submission per student per question (questions with 2+ eligible submissions), averaged.
export const improvement = ({ studentIds, attempts }) => {
  const ids = new Set(studentIds.map(sid));
  const { eligible, excluded } = partitionAttempts(attempts.filter((a) => ids.has(sid(a.userId))));
  const groups = new Map();
  for (const a of [...eligible].sort(byTime)) {
    const k = `${sid(a.userId)}|${sid(a.questionId)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a.score);
  }
  const firsts = []; const lasts = []; const students = new Set();
  for (const [k, scores] of groups) {
    if (scores.length < 2) continue;
    firsts.push(scores[0]); lasts.push(scores[scores.length - 1]); students.add(k.split('|')[0]);
  }
  if (students.size < MIN_N) return insufficient(students.size, { excluded });
  return { students: students.size, pairs: firsts.length, meanFirst: round(mean(firsts)), meanLatest: round(mean(lasts)), delta: round(mean(lasts) - mean(firsts)), excluded };
};

export const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // blocks spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header, rows) => `${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
