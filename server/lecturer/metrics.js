// Pure functions behind the lecturer dashboard. Plain objects in, plain JSON-safe objects out; no database and
// no clock (callers pass `now`), so every rule here is unit-testable.
//
// Rules (documented in API_LECTURER.md):
// - Interview scores are computed from the stored answers, not from the stored overall score, so that answers
//   scored by the basic fallback scorer (feedback.source === 'fallback') can be left out. Skipped answers are left
//   out too (the interview's own score ignores them). Only completed interviews count.
// - Categories come from each answer's questionType: behavioral -> behavioural; technical, system_design and
//   problem-solving -> technical; coding -> coding. Communication is feedback.communicationClarity (0-10) x 10.
// - A CV result counts only when its scoreBreakdown.aiAvailable !== false.
// - Averages across students are means of per-student values, so a student with many interviews does not dominate.
//   A value is shown only when at least MIN_N students have it; otherwise it is null with a notice.
import { partitionAttempts, MIN_N, DAY_MS, round, mean } from '../analytics/aggregate.js';

export { MIN_N };
const sid = (v) => String(v);
const t = (d) => (d ? new Date(d).getTime() : NaN);
const latestDate = (...ds) => {
  const ms = ds.map(t).filter((x) => Number.isFinite(x));
  return ms.length ? new Date(Math.max(...ms)) : null;
};

export const CATEGORIES = ['behavioural', 'technical', 'coding', 'communication'];
const TYPE_TO_CATEGORY = { behavioral: 'behavioural', technical: 'technical', system_design: 'technical', 'problem-solving': 'technical', coding: 'coding' };

export const LOW_SCORE = 50;
export const INACTIVE_DAYS = 30;
export const ATTENTION_CODES = ['no_interview', 'no_cv', 'low_interview_score', 'low_cv_match', 'inactive_30_days'];

// ---------------------------------------------------------------- interviews
const isAnswered = (r) => r && !r.skipped && r.feedback && typeof r.feedback.score === 'number';
export const isFallbackAnswer = (r) => r && !r.skipped && r.feedback?.source === 'fallback';
const isEligibleAnswer = (r) => isAnswered(r) && r.feedback.source !== 'fallback';

// Per-answer pools for one or more interviews: { all: [scores], behavioural: [...], ..., communication: [...] }
const answerPools = (responses) => {
  const pools = { all: [], behavioural: [], technical: [], coding: [], communication: [] };
  let excluded = 0;
  for (const r of responses) {
    if (isFallbackAnswer(r)) { excluded += 1; continue; }
    if (!isEligibleAnswer(r)) continue;
    pools.all.push(r.feedback.score);
    const cat = TYPE_TO_CATEGORY[r.questionType];
    if (cat) pools[cat].push(r.feedback.score);
    const c = r.feedback.communicationClarity;
    if (typeof c === 'number' && c >= 0 && c <= 10) pools.communication.push(c * 10);
  }
  return { pools, excluded };
};

const categoriesOf = (pools) => Object.fromEntries(CATEGORIES.map((c) => [c, round(mean(pools[c]))]));

// One interview: { score, categoryScores, answered, excludedFallbackAnswers, skipped }
export const interviewScores = (iv) => {
  const responses = iv?.responses || [];
  const { pools, excluded } = answerPools(responses);
  return {
    score: round(mean(pools.all)),
    categoryScores: categoriesOf(pools),
    answered: pools.all.length,
    excludedFallbackAnswers: excluded,
    skipped: responses.filter((r) => r?.skipped).length,
  };
};

export const isCompleted = (iv) => iv?.status === 'completed';
const ivDate = (iv) => iv.completedAt || iv.createdAt;
const byDate = (getter) => (a, b) => (t(getter(a)) || 0) - (t(getter(b)) || 0) || (sid(a._id) < sid(b._id) ? -1 : 1);

export const readinessOf = (iv) => iv?.overallFeedback?.readinessLevel || iv?.overallFeedback?.feedback?.readinessLevel || null;

export const jobExcerpt = (text, max = 120) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// ---------------------------------------------------------------- delivery metrics (written by the camera feature)
const HEAD = ['low', 'medium', 'high'];
const pct = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
const count = (v, max = 100000) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

// Returns a clean copy of one answer's deliveryMetrics, or null when absent. Bad values become null.
// Camera-derived values are only kept when cameraUsed is true.
export const cleanDelivery = (dm) => {
  if (!dm || typeof dm !== 'object') return null;
  const cameraUsed = dm.cameraUsed === true;
  return {
    cameraUsed,
    faceVisiblePct: cameraUsed ? pct(dm.faceVisiblePct) : null,
    eyeContactPct: cameraUsed ? pct(dm.eyeContactPct) : null,
    lookAwayCount: cameraUsed ? count(dm.lookAwayCount) : null,
    headMovement: cameraUsed && HEAD.includes(dm.headMovement) ? dm.headMovement : null,
    wordsPerMinute: num(dm.wordsPerMinute, 1000),
    fillerWordCount: count(dm.fillerWordCount),
    durationSec: num(dm.durationSec, 4 * 3600),
  };
};

const NUMERIC_DELIVERY = ['faceVisiblePct', 'eyeContactPct', 'lookAwayCount', 'wordsPerMinute', 'fillerWordCount', 'durationSec'];

// One student's delivery averages over every answer that carries metrics (completed interviews only).
// Each metric reports its own n (number of answers that had it).
export const studentDelivery = (interviews) => {
  const rows = interviews.filter(isCompleted).flatMap((iv) => (iv.responses || []).map((r) => cleanDelivery(r?.deliveryMetrics))).filter(Boolean);
  if (!rows.length) return { answers: 0, hasData: false };
  const out = { answers: rows.length, hasData: true };
  out.cameraUsedPct = round((rows.filter((r) => r.cameraUsed).length / rows.length) * 100);
  for (const k of NUMERIC_DELIVERY) {
    const vals = rows.map((r) => r[k]).filter((v) => v != null);
    out[k] = { average: round(mean(vals)), n: vals.length };
  }
  const heads = rows.map((r) => r.headMovement).filter(Boolean);
  out.headMovement = { low: 0, medium: 0, high: 0, n: heads.length };
  for (const h of heads) out.headMovement[h] += 1;
  return out;
};

// ---------------------------------------------------------------- CV analyses
// Non-tech job ads get matchPercentage 0 by design; they say nothing about the CV, so they do not count either.
export const countsTowardMatch = (result) => result?.scoreBreakdown?.aiAvailable !== false && result?.isNonTechRole !== true
  && typeof result?.matchPercentage === 'number';

// The CV controller re-analyses the same CV in place (unique userId + resumeHash), so updatedAt is the last run.
export const cvDate = (analysis) => analysis?.updatedAt || analysis?.createdAt || null;

// For one analysis: best eligible match and how many results were left out because the AI was unavailable.
export const bestMatch = (analysis) => {
  const results = analysis?.results || [];
  const eligible = results.filter(countsTowardMatch).map((r) => r.matchPercentage);
  return { best: eligible.length ? Math.max(...eligible) : null, excludedResults: results.filter((r) => r?.scoreBreakdown?.aiAvailable === false).length };
};

// Missing skills of one analysis (union over its jobs, case-insensitive, first spelling kept).
export const missingSkillsOf = (analysis) => {
  const seen = new Map();
  for (const r of analysis?.results || []) {
    for (const s of r?.scoreBreakdown?.missingSkills || []) {
      const k = String(s || '').trim().toLowerCase();
      if (k && !seen.has(k)) seen.set(k, String(s).trim());
    }
  }
  return [...seen.values()];
};

// ---------------------------------------------------------------- practice
export const practiceSummary = (attempts) => {
  const submits = attempts.filter((a) => a.runKind === 'submit');
  const { eligible, excluded } = partitionAttempts(submits);
  const solved = new Set(eligible.filter((a) => a.verdict === 'accepted').map((a) => sid(a.questionId)));
  const last = submits.reduce((m, a) => (t(a.createdAt) > t(m) || !m ? a.createdAt : m), null);
  return {
    submissions: submits.length, solved: solved.size, averageScore: round(mean(eligible.map((a) => a.score))),
    excludedScores: excluded, lastSubmissionAt: last ? new Date(last).toISOString() : null,
  };
};

// ---------------------------------------------------------------- one student
// data: { interviews, cvAnalyses, attempts } already limited to this student.
export const studentRow = (user, data, now) => {
  const interviews = data.interviews || [];
  const cvAnalyses = [...(data.cvAnalyses || [])].sort(byDate(cvDate));
  const attempts = data.attempts || [];
  const completed = interviews.filter(isCompleted).sort(byDate(ivDate));
  const scored = completed.map((iv) => ({ iv, s: interviewScores(iv) })).filter((x) => x.s.score != null);
  const { pools, excluded } = answerPools(completed.flatMap((iv) => iv.responses || []));

  const withMatch = cvAnalyses.map((a) => ({ a, m: bestMatch(a) })).filter((x) => x.m.best != null);
  const latestCvMatch = withMatch.length ? withMatch[withMatch.length - 1].m.best : null;
  const practice = practiceSummary(attempts);

  const lastActive = latestDate(
    user.lastActive,
    ...interviews.flatMap((iv) => [iv.createdAt, iv.completedAt]),
    ...cvAnalyses.map(cvDate),
    ...attempts.filter((a) => a.runKind !== 'draft').map((a) => a.createdAt),
  );

  const row = {
    id: sid(user._id), name: user.name || '', email: user.email || '', group: user.group || '',
    lastActive: lastActive ? lastActive.toISOString() : null,
    interviewsCompleted: completed.length,
    latestInterviewScore: scored.length ? scored[scored.length - 1].s.score : null,
    avgInterviewScore: round(mean(scored.map((x) => x.s.score))),
    latestCvMatch,
    cvAnalyses: cvAnalyses.length,
    practiceSolved: practice.solved,
  };
  row.needsAttention = attentionReasons(row, now);
  // Not part of the table, used for overview aggregates.
  Object.defineProperty(row, '_agg', {
    enumerable: false,
    value: {
      categories: categoriesOf(pools), excludedAnswers: excluded,
      excludedCvResults: cvAnalyses.reduce((n, a) => n + bestMatch(a).excludedResults, 0),
      latestMissingSkills: cvAnalyses.length ? missingSkillsOf(cvAnalyses[cvAnalyses.length - 1]) : [],
      delivery: studentDelivery(interviews),
    },
  });
  return row;
};

export const attentionReasons = (row, now) => {
  const out = [];
  if (!row.interviewsCompleted) out.push({ code: 'no_interview', message: 'Has not completed a mock interview' });
  if (!row.cvAnalyses) out.push({ code: 'no_cv', message: 'Has not analysed a CV' });
  if (row.latestInterviewScore != null && row.latestInterviewScore < LOW_SCORE) {
    out.push({ code: 'low_interview_score', message: `Latest mock interview score is ${row.latestInterviewScore} (below ${LOW_SCORE})`, value: row.latestInterviewScore, threshold: LOW_SCORE });
  }
  if (row.latestCvMatch != null && row.latestCvMatch < LOW_SCORE) {
    out.push({ code: 'low_cv_match', message: `Latest CV match is ${row.latestCvMatch}% (below ${LOW_SCORE}%)`, value: row.latestCvMatch, threshold: LOW_SCORE });
  }
  const last = t(row.lastActive);
  if (!Number.isFinite(last) || t(now) - last >= INACTIVE_DAYS * DAY_MS) {
    const days = Number.isFinite(last) ? Math.floor((t(now) - last) / DAY_MS) : null;
    out.push({ code: 'inactive_30_days', message: days == null ? 'No recorded activity' : `No activity for ${days} days`, days, threshold: INACTIVE_DAYS });
  }
  return out;
};

// ---------------------------------------------------------------- overview
const shown = (vals) => {
  const n = vals.length;
  return { average: n >= MIN_N ? round(mean(vals)) : null, n };
};
const notice = (n) => (n < MIN_N ? `Only ${n} student(s) have data here. At least ${MIN_N} are needed before averages are shown.` : null);

export const overview = (rows, now) => {
  const within = (days) => rows.filter((r) => r.lastActive && t(now) - t(r.lastActive) < days * DAY_MS).length;
  const totals = {
    students: rows.length,
    withMockInterview: rows.filter((r) => r.interviewsCompleted > 0).length,
    withCvAnalysis: rows.filter((r) => r.cvAnalyses > 0).length,
    active7d: within(7), active30d: within(30),
    needingAttention: rows.filter((r) => r.needsAttention.length).length,
  };

  const overall = shown(rows.map((r) => r.avgInterviewScore).filter((v) => v != null));
  const interview = {
    overall,
    ...Object.fromEntries(CATEGORIES.map((c) => [c, shown(rows.map((r) => r._agg.categories[c]).filter((v) => v != null))])),
    excludedFallbackAnswers: rows.reduce((n, r) => n + r._agg.excludedAnswers, 0),
    insufficientData: overall.n < MIN_N, notice: notice(overall.n), minimum: MIN_N,
  };

  const best = shown(rows.map((r) => r.latestCvMatch).filter((v) => v != null));
  const skillCounts = new Map();
  let withLatest = 0;
  for (const r of rows) {
    if (r.cvAnalyses) withLatest += 1;
    for (const s of r._agg.latestMissingSkills) {
      const k = s.toLowerCase();
      if (!skillCounts.has(k)) skillCounts.set(k, { skill: s, students: 0 });
      skillCounts.get(k).students += 1;
    }
  }
  const topMissingSkills = [...skillCounts.values()]
    .sort((a, b) => b.students - a.students || a.skill.toLowerCase().localeCompare(b.skill.toLowerCase()))
    .slice(0, 10);
  const cv = {
    averageBestMatch: best, excludedAiUnavailableResults: rows.reduce((n, r) => n + r._agg.excludedCvResults, 0),
    topMissingSkills, studentsWithAnalysis: withLatest,
    insufficientData: best.n < MIN_N, notice: notice(best.n), minimum: MIN_N,
  };

  const d = rows.map((r) => r._agg.delivery).filter((x) => x.hasData);
  const dn = d.length;
  const delivery = { n: dn, answers: d.reduce((n, x) => n + x.answers, 0), insufficientData: dn < MIN_N, notice: notice(dn), minimum: MIN_N };
  delivery.cameraUsedPct = dn >= MIN_N ? shown(d.map((x) => x.cameraUsedPct)) : { average: null, n: dn };
  for (const k of NUMERIC_DELIVERY) {
    const vals = d.filter((x) => x[k].n > 0).map((x) => x[k].average);
    delivery[k] = dn >= MIN_N ? shown(vals) : { average: null, n: vals.length };
  }
  const heads = { low: 0, medium: 0, high: 0 };
  for (const x of d) for (const h of ['low', 'medium', 'high']) heads[h] += x.headMovement[h];
  const headTotal = heads.low + heads.medium + heads.high;
  delivery.headMovement = dn >= MIN_N && headTotal
    ? { lowPct: round((heads.low / headTotal) * 100), mediumPct: round((heads.medium / headTotal) * 100), highPct: round((heads.high / headTotal) * 100), answers: headTotal }
    : { lowPct: null, mediumPct: null, highPct: null, answers: headTotal };

  return { totals, interview, cv, delivery };
};

// ---------------------------------------------------------------- table: filter, sort, page
export const SORT_KEYS = ['name', 'lastActive', 'interviewsCompleted', 'latestInterviewScore', 'avgInterviewScore', 'latestCvMatch', 'cvAnalyses', 'practiceSolved'];

// Returns { key, desc } or null for an unknown key. '-key' sorts descending.
export const parseSort = (raw) => {
  const s = typeof raw === 'string' && raw ? raw : 'name';
  const desc = s.startsWith('-');
  const key = desc ? s.slice(1) : s;
  return SORT_KEYS.includes(key) ? { key, desc } : null;
};

// Nulls always last; ties by name then id.
export const sortRows = (rows, { key, desc }) => {
  const val = (r) => (key === 'lastActive' ? (r.lastActive ? t(r.lastActive) : null) : key === 'name' ? (r.name || '').toLowerCase() : r[key]);
  const tie = (a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...rows].sort((a, b) => {
    const va = val(a); const vb = val(b);
    if (va == null && vb == null) return tie(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return (desc ? -c : c) || tie(a, b);
  });
};

export const searchRows = (rows, search) => {
  const q = String(search || '').trim().toLowerCase();
  return q ? rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q)) : rows;
};
