// Pure functions behind the dashboard. Plain objects in, plain JSON-safe objects out; no database and
// no clock (callers pass `now`), so every rule here is unit-testable.
//
// Rules:
// - Interview scores are computed from the stored answers, not from the stored overall score, so that answers
//   scored by the basic fallback scorer (feedback.source === 'fallback') can be left out. Skipped answers are left
//   out too (the interview's own score ignores them). Only completed interviews count.
// - Categories come from each answer's questionType: behavioral -> behavioural; technical, system_design and
//   problem-solving -> technical; coding -> coding. Communication is feedback.communicationClarity (0-10) x 10.
// - The CV score is the latest result scored against the student's CURRENT target role (kind 'target_role', its
//   targetRoleId equal to the student's, and that role still in the institution's list) whose
//   scoreBreakdown.aiAvailable !== false. Results checked against a pasted job description never count.
// - Averages across students are means of per-student values, so a student with many interviews does not dominate.
// - The most common missing skills are shown only when at least MIN_GROUP students have a CV score: with fewer,
//   a skill chip points at an individual.
import { findTargetRole } from '../../services/targetRoles.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const round = (n, p = 1) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** p) / 10 ** p);
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const MIN_GROUP = 5;
export const INACTIVE_DAYS = 14;
export const SCORE_DROP = 15;
export const ATTENTION_CODES = ['no_cv', 'no_interview', 'inactive_14_days', 'score_drop_15'];
export const ATTENTION_LABELS = {
  no_cv: 'No CV yet',
  no_interview: 'No interview yet',
  inactive_14_days: 'Inactive 14+ days',
  score_drop_15: 'Score dropped 15+ points',
};
export const LEVELS = ['easy', 'medium', 'hard'];

// Practice score eligibility: only submitted attempts with a numeric score whose scoreSource is not 'ai' or 'fallback'.
const isScored = (a) => a.runKind === 'submit' && typeof a.score === 'number';
const isExcluded = (a) => isScored(a) && (a.scoreSource === 'ai' || a.scoreSource === 'fallback');
export const partitionAttempts = (attempts) => {
  const eligible = [];
  let excluded = 0;
  for (const a of attempts) {
    if (isExcluded(a)) excluded += 1;
    else if (isScored(a)) eligible.push(a);
  }
  return { eligible, excluded };
};

const sid = (v) => String(v);
const t = (d) => (d ? new Date(d).getTime() : NaN);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const latestDate = (...ds) => {
  const ms = ds.map(t).filter((x) => Number.isFinite(x));
  return ms.length ? new Date(Math.max(...ms)) : null;
};

export const CATEGORIES = ['behavioural', 'technical', 'coding', 'communication'];
const TYPE_TO_CATEGORY = { behavioral: 'behavioural', technical: 'technical', system_design: 'technical', 'problem-solving': 'technical', coding: 'coding' };

// ---------------------------------------------------------------- interviews
const isAnswered = (r) => r && !r.skipped && r.feedback && typeof r.feedback.score === 'number';
export const isFallbackAnswer = (r) => r && !r.skipped && r.feedback?.source === 'fallback';
const isEligibleAnswer = (r) => isAnswered(r) && r.feedback.source !== 'fallback';

// Per-answer pools for one interview: { all: [scores], behavioural: [...], ..., communication: [...] }
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
export const levelOf = (v) => (LEVELS.includes(v) ? v : null);
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
// For the student record: non-tech job ads get matchPercentage 0 by design and say nothing about the CV.
export const countsTowardMatch = (result) => result?.scoreBreakdown?.aiAvailable !== false && result?.isNonTechRole !== true
  && typeof result?.matchPercentage === 'number';

// The result kind; documents written before results had a kind were all checked against pasted job descriptions.
export const resultKind = (result) => (result?.kind === 'target_role' ? 'target_role' : 'job_description');

// A result that counts as the student's CV score. A result flagged non-tech or failed says nothing about the CV.
export const isTargetRoleScore = (result) => resultKind(result) === 'target_role'
  && result?.scoreBreakdown?.aiAvailable !== false && result?.isNonTechRole !== true && result?.hasError !== true
  && isNum(result?.matchPercentage);

// The CV controller re-analyses the same CV in place (unique userId + resumeHash), so updatedAt is the last run.
export const cvDate = (analysis) => analysis?.updatedAt || analysis?.createdAt || null;

// For one analysis: best eligible match and how many results were left out because the AI was unavailable.
export const bestMatch = (analysis) => {
  const results = analysis?.results || [];
  const eligible = results.filter(countsTowardMatch).map((r) => r.matchPercentage);
  return { best: eligible.length ? Math.max(...eligible) : null, excludedResults: results.filter((r) => r?.scoreBreakdown?.aiAvailable === false).length };
};

// The latest target-role result with an AI score for the role `targetRoleId`, over analyses sorted oldest first.
// Null when there is none, or when no role is given: after a role change or a deleted role the old score does
// not count until the student re-analyses.
export const latestTargetRoleResult = (analyses, targetRoleId) => {
  if (!targetRoleId) return null;
  const wanted = sid(targetRoleId);
  for (let i = analyses.length - 1; i >= 0; i -= 1) {
    const results = (analyses[i]?.results || []).filter((r) => isTargetRoleScore(r) && r.targetRoleId != null && sid(r.targetRoleId) === wanted);
    if (results.length) return results[results.length - 1];
  }
  return null;
};

const skillList = (xs) => (Array.isArray(xs) ? xs.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : []);

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
// institution: the student's institution with its targetRoles (optional), for the target role title.
export const studentRow = (user, data, now, institution = null) => {
  const interviews = data.interviews || [];
  const cvAnalyses = [...(data.cvAnalyses || [])].sort(byDate(cvDate));
  const attempts = data.attempts || [];
  const completed = interviews.filter(isCompleted).sort(byDate(ivDate));
  const scores = completed.map((iv) => interviewScores(iv).score);
  const latest = completed.length ? completed[completed.length - 1] : null;
  const lastInterviewScore = latest ? scores[scores.length - 1] : null;
  const previousScore = completed.length >= 2 ? scores[scores.length - 2] : null;
  const targetRole = findTargetRole(institution, user.targetRoleId);
  const cvResult = latestTargetRoleResult(cvAnalyses, targetRole ? targetRole._id : null);
  const practice = practiceSummary(attempts);

  const lastActive = latestDate(
    user.lastActive,
    ...interviews.flatMap((iv) => [iv.createdAt, iv.completedAt]),
    ...cvAnalyses.map(cvDate),
    ...attempts.filter((a) => a.runKind !== 'draft').map((a) => a.createdAt),
  );

  // Only the upload date of the profile CV is read (the dashboard repo never selects its text).
  const hasCv = cvAnalyses.length > 0 || Boolean(user.currentCV?.uploadedAt);

  const row = {
    id: sid(user._id), name: user.name || '', email: user.email || '', group: user.group || '',
    targetRoleTitle: targetRole?.title ?? null,
    cvScore: cvResult ? cvResult.matchPercentage : null,
    // A CV is on file (uploaded, or analysed before) but has no score against the current role yet.
    cvNotScored: !cvResult && hasCv,
    lastInterviewScore,
    lastLevelReached: latest ? levelOf(latest.levelReached) : null,
    trend: scores.filter(isNum).slice(-3),
    practiceSolved: practice.solved,
    lastActive: lastActive ? lastActive.toISOString() : null,
  };
  row.attention = attentionFor({
    hasCv, hasInterview: completed.length > 0, lastActive: row.lastActive, lastInterviewScore, previousScore,
  }, now);
  // Not part of the table, used for the overview.
  Object.defineProperty(row, '_agg', { enumerable: false, value: { missingSkills: cvResult ? skillList(cvResult.scoreBreakdown?.missingSkills) : [] } });
  return row;
};

// Needs-attention flags, in ATTENTION_CODES order, each with its plain label.
export const attentionFor = ({ hasCv, hasInterview, lastActive, lastInterviewScore, previousScore }, now) => {
  const codes = [];
  if (!hasCv) codes.push('no_cv');
  if (!hasInterview) codes.push('no_interview');
  const last = t(lastActive);
  if (!Number.isFinite(last) || t(now) - last >= INACTIVE_DAYS * DAY_MS) codes.push('inactive_14_days');
  if (isNum(lastInterviewScore) && isNum(previousScore) && previousScore - lastInterviewScore >= SCORE_DROP) codes.push('score_drop_15');
  return codes.map((code) => ({ code, label: ATTENTION_LABELS[code] }));
};

// ---------------------------------------------------------------- overview
export const overview = (rows, now) => {
  const cvScores = rows.map((r) => r.cvScore).filter(isNum);
  const interviewScoresList = rows.map((r) => r.lastInterviewScore).filter(isNum);
  const levelReachedCounts = { easy: 0, medium: 0, hard: 0 };
  for (const r of rows) if (r.lastLevelReached) levelReachedCounts[r.lastLevelReached] += 1;

  let topMissingSkills = null;
  if (cvScores.length >= MIN_GROUP) {
    const counts = new Map();
    for (const r of rows) {
      for (const s of new Set(r._agg.missingSkills.map((x) => x.toLowerCase()))) {
        const spelled = r._agg.missingSkills.find((x) => x.toLowerCase() === s);
        if (!counts.has(s)) counts.set(s, { skill: spelled, students: 0 });
        counts.get(s).students += 1;
      }
    }
    topMissingSkills = [...counts.values()]
      .sort((a, b) => b.students - a.students || a.skill.toLowerCase().localeCompare(b.skill.toLowerCase()))
      .slice(0, 10);
  }

  return {
    students: rows.length,
    activeLast14Days: rows.filter((r) => r.lastActive && t(now) - t(r.lastActive) < INACTIVE_DAYS * DAY_MS).length,
    needingAttention: rows.filter((r) => r.attention.length).length,
    avgCvScore: round(mean(cvScores)),
    studentsWithCvScore: cvScores.length,
    avgInterviewScore: round(mean(interviewScoresList)),
    studentsWithInterviewScore: interviewScoresList.length,
    levelReachedCounts,
    topMissingSkills,
    minimumForSkills: MIN_GROUP,
    practiceSolved: rows.reduce((n, r) => n + r.practiceSolved, 0),
  };
};

// ---------------------------------------------------------------- table: filter, sort, page
export const SORT_KEYS = ['name', 'group', 'targetRoleTitle', 'cvScore', 'lastInterviewScore', 'practiceSolved', 'lastActive'];
const TEXT_KEYS = ['name', 'group', 'targetRoleTitle'];

// Returns { key, desc } or null for an unknown key. '-key' sorts descending.
export const parseSort = (raw) => {
  const s = typeof raw === 'string' && raw ? raw : 'name';
  const desc = s.startsWith('-');
  const key = desc ? s.slice(1) : s;
  return SORT_KEYS.includes(key) ? { key, desc } : null;
};

// Nulls (and empty text) always last; ties by name then id.
export const sortRows = (rows, { key, desc }) => {
  const val = (r) => {
    if (key === 'lastActive') return r.lastActive ? t(r.lastActive) : null;
    if (TEXT_KEYS.includes(key)) return r[key] ? r[key].toLowerCase() : null;
    return r[key];
  };
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
