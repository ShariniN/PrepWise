// Lecturer dashboard: how the caller's own university's students do in mock interviews, CV analysis and practice.
// Always scoped to req.user.institutionId and to active students. Every view of one student's data is audited.
// Responses are built from whitelists: CV text, passwords, OTPs, invite tokens and hidden tests never leave.
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { cleanGroup, PeopleError } from '../modules/people/people.service.js';
import { fail, isId, intParam } from '../analytics/access.js';
import { toCsv } from '../analytics/aggregate.js';
import lecturerRepo from './repo.js';
import * as m from './metrics.js';

const sid = (v) => String(v);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const strList = (xs, max = 20) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string').slice(0, max) : []);
const groupBy = (rows) => {
  const out = new Map();
  for (const r of rows) {
    const k = sid(r.userId);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
};

// Reads ?group=. Returns { group } ('' = all) or sends a 400 and returns null.
const groupParam = (req, res) => {
  try {
    const raw = req.query.group;
    return { group: typeof raw === 'string' ? cleanGroup(raw) : '' };
  } catch (error) {
    if (error instanceof PeopleError) { fail(res, 400, error.message, { code: error.code }); return null; }
    throw error;
  }
};

// Loads every active student in scope with their data, and builds the table rows.
const loadRows = async (institutionId, group, now) => {
  const students = await lecturerRepo.listStudents(institutionId, group ? { group } : {});
  const ids = students.map((s) => sid(s._id));
  const [interviews, cvs, attempts] = await Promise.all([
    lecturerRepo.interviewsFor(institutionId, ids),
    lecturerRepo.cvAnalysesFor(institutionId, ids),
    lecturerRepo.attemptsFor(institutionId, ids),
  ]);
  const iv = groupBy(interviews); const cv = groupBy(cvs); const at = groupBy(attempts);
  return students.map((s) => m.studentRow(s, { interviews: iv.get(sid(s._id)) || [], cvAnalyses: cv.get(sid(s._id)) || [], attempts: at.get(sid(s._id)) || [] }, now));
};

// ---------------------------------------------------------------- GET /overview
export const overview = async (req, res) => {
  const g = groupParam(req, res);
  if (!g) return;
  const institutionId = institutionOf(req);
  const now = new Date();
  const [rows, groups] = await Promise.all([loadRows(institutionId, g.group, now), lecturerRepo.distinctGroups(institutionId)]);
  res.json({
    success: true, group: g.group || null, groups: [...new Set(groups)].sort((a, b) => a.localeCompare(b)), generatedAt: now.toISOString(),
    ...m.overview(rows, now),
  });
};

// ---------------------------------------------------------------- GET /students
const tableRows = async (req, res) => {
  const g = groupParam(req, res);
  if (!g) return null;
  const sort = m.parseSort(req.query.sort);
  if (!sort) { fail(res, 400, `sort must be one of: ${m.SORT_KEYS.join(', ')} (prefix with - for descending)`); return null; }
  const attention = typeof req.query.attention === 'string' && req.query.attention ? req.query.attention : null;
  if (attention && !m.ATTENTION_CODES.includes(attention)) { fail(res, 400, `attention must be one of: ${m.ATTENTION_CODES.join(', ')}`); return null; }
  let rows = await loadRows(institutionOf(req), g.group, new Date());
  rows = m.searchRows(rows, typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '');
  if (req.query.needsAttention === '1' || req.query.needsAttention === 'true') rows = rows.filter((r) => r.needsAttention.length);
  if (attention) rows = rows.filter((r) => r.needsAttention.some((x) => x.code === attention));
  return { rows: m.sortRows(rows, sort), sort, group: g.group };
};

export const students = async (req, res) => {
  const t = await tableRows(req, res);
  if (!t) return;
  const pageSize = intParam(req.query.pageSize, 25, 1, 100);
  const total = t.rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = intParam(req.query.page, 1, 1, 100000);
  res.json({
    success: true, students: t.rows.slice((page - 1) * pageSize, page * pageSize),
    page, pageSize, total, totalPages, sort: `${t.sort.desc ? '-' : ''}${t.sort.key}`, group: t.group || null,
  });
};

// ---------------------------------------------------------------- GET /students.csv
export const studentsCsv = async (req, res) => {
  const t = await tableRows(req, res);
  if (!t) return;
  const header = ['name', 'email', 'group', 'last_active', 'interviews_completed', 'latest_interview_score', 'avg_interview_score',
    'latest_cv_match', 'cv_analyses', 'practice_solved', 'needs_attention'];
  const lines = t.rows.map((r) => [r.name, r.email, r.group, r.lastActive, r.interviewsCompleted, r.latestInterviewScore, r.avgInterviewScore,
    r.latestCvMatch, r.cvAnalyses, r.practiceSolved, r.needsAttention.map((x) => x.code).join(';')]);
  await audit({ actor: req.user.id, action: 'lecturer.export_students', institutionId: institutionOf(req), meta: { rows: lines.length, group: t.group || null } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
  res.send(toCsv(header, lines));
};

// ---------------------------------------------------------------- GET /students/:id
const loadStudent = async (req, res) => {
  if (!isId(req.params.id)) { fail(res, 404, 'Student not found'); return null; }
  const institutionId = institutionOf(req);
  const student = await lecturerRepo.findStudent(institutionId, req.params.id);
  if (!student) { fail(res, 404, 'Student not found'); return null; }
  return { institutionId, student };
};

const cvResultView = (r, analysis) => {
  const b = r.scoreBreakdown && typeof r.scoreBreakdown === 'object' ? r.scoreBreakdown : null;
  const jd = Array.isArray(analysis.jobDescriptions) ? analysis.jobDescriptions[r.jobIndex ?? 0] : '';
  return {
    jobTitle: r.jobTitle || null, company: r.company || null, jobExcerpt: m.jobExcerpt(jd), isNonTechRole: r.isNonTechRole === true,
    matchPercentage: typeof r.matchPercentage === 'number' ? r.matchPercentage : null,
    countsTowardAverage: m.countsTowardMatch(r),
    scoreBreakdown: b ? {
      aiAvailable: b.aiAvailable ?? null, aiScore: b.aiScore ?? null, keywordScore: b.keywordScore ?? null, model: b.model ?? null,
      requiredSkills: strList(b.requiredSkills, 50), matchedSkills: strList(b.matchedSkills, 50), missingSkills: strList(b.missingSkills, 50),
    } : null,
    strengths: strList(r.strengths),
    weaknesses: [...strList(r.contentWeaknesses), ...strList(r.structureWeaknesses)],
  };
};

const interviewListItem = (iv) => {
  const s = m.interviewScores(iv);
  return {
    id: sid(iv._id), status: iv.status, date: iso(iv.completedAt || iv.createdAt), jobExcerpt: m.jobExcerpt(iv.jobDescription),
    score: m.isCompleted(iv) ? s.score : null, categoryScores: s.categoryScores, readinessLevel: m.readinessOf(iv),
    answered: s.answered, skipped: s.skipped, excludedFallbackAnswers: s.excludedFallbackAnswers,
  };
};

const skillsView = (a) => {
  if (!a) return null;
  const skills = (a.skills || []).filter((s) => s && typeof s.name === 'string' && typeof s.proficiencyLevel === 'number')
    .map((s) => ({ name: s.name, category: s.category || 'General', proficiencyLevel: s.proficiencyLevel }));
  const sorted = [...skills].sort((x, y) => y.proficiencyLevel - x.proficiencyLevel || x.name.localeCompare(y.name));
  return {
    assessedAt: iso(a.createdAt), skillsRated: skills.length,
    averageProficiency: skills.length ? Math.round((skills.reduce((n, s) => n + s.proficiencyLevel, 0) / skills.length) * 10) / 10 : null,
    strongest: sorted.slice(0, 5), weakest: sorted.slice(-5).reverse(), skills: sorted,
  };
};

export const student = async (req, res) => {
  const s = await loadStudent(req, res);
  if (!s) return;
  const { institutionId, student: u } = s;
  const id = sid(u._id);
  const [interviews, cvs, attempts, skills] = await Promise.all([
    lecturerRepo.interviewsFor(institutionId, [id]),
    lecturerRepo.cvAnalysesFor(institutionId, [id]),
    lecturerRepo.attemptsFor(institutionId, [id]),
    lecturerRepo.latestSkillAssessment(institutionId, id),
  ]);
  const mine = (xs) => xs.filter((x) => sid(x.userId) === id); // defence in depth
  const ivs = mine(interviews); const cv = mine(cvs); const at = mine(attempts);
  const row = m.studentRow(u, { interviews: ivs, cvAnalyses: cv, attempts: at }, new Date());
  await audit({ actor: req.user.id, action: 'lecturer.view_student', target: id, institutionId, meta: { view: 'profile' } });
  const newest = (getter) => (a, b) => new Date(getter(b) || 0) - new Date(getter(a) || 0);
  res.json({
    success: true,
    student: { id, name: u.name || '', email: u.email || '', group: u.group || '' },
    summary: row,
    interviews: [...ivs].sort(newest((x) => x.completedAt || x.createdAt)).map(interviewListItem),
    cvAnalyses: [...cv].sort(newest(m.cvDate)).map((a) => ({
      id: sid(a._id), date: iso(m.cvDate(a)), firstAnalysedAt: iso(a.createdAt), bestMatch: m.bestMatch(a).best,
      results: (a.results || []).map((r) => cvResultView(r, a)),
    })),
    skills: skills && sid(skills.userId) === id ? skillsView(skills) : null,
    practice: m.practiceSummary(at),
    delivery: m.studentDelivery(ivs),
  });
};

// ---------------------------------------------------------------- GET /students/:id/interviews/:interviewId
const FEEDBACK_NUMBERS = ['score', 'questionRelevance', 'correctness', 'syntax', 'languageBestPractices', 'efficiency', 'structureAndReadability',
  'edgeCaseHandling', 'communicationClarity', 'technicalAccuracy', 'structuredResponse', 'codeQuality', 'timeEfficiency'];

const feedbackView = (f) => {
  if (!f || typeof f !== 'object') return null;
  const out = { source: f.source || null, executionSource: f.executionSource || null, responseType: f.responseType || null };
  for (const k of FEEDBACK_NUMBERS) out[k] = typeof f[k] === 'number' ? f[k] : null;
  out.strengths = strList(f.strengths);
  out.improvements = strList(f.improvements);
  out.detailedAnalysis = typeof f.detailedAnalysis === 'string' ? f.detailedAnalysis : '';
  out.overallAssessment = typeof f.overallAssessment === 'string' ? f.overallAssessment : '';
  return out;
};

const executionView = (e) => (e && typeof e === 'object' ? {
  success: !!e.success, verdict: e.verdict || null, serverVerified: !!e.serverVerified, unavailable: !!e.unavailable,
  testsPassed: e.testsPassed ?? null, testsTotal: e.testsTotal ?? null, output: e.output ?? '', error: e.error ?? '',
  executionTime: e.executionTime ?? null, memory: e.memory ?? null, executedAt: iso(e.executedAt),
} : null);

const answerView = (q, r) => ({
  questionId: q?.questionId || r?.questionId || null,
  type: q?.type || r?.questionType || null, category: q?.category || null, difficulty: q?.difficulty || null,
  question: q?.question || r?.question || '',
  answered: !!r, skipped: !!r?.skipped,
  answer: r ? {
    text: r.textResponse || '', transcript: r.transcription || '', code: r.code || '', language: r.language || null,
    submittedAt: iso(r.submittedAt), responseTimeSec: r.responseTime ?? null, recordingDurationSec: r.recordingDuration ?? null,
  } : null,
  feedback: feedbackView(r?.feedback),
  feedbackSource: r?.feedback?.source || null,
  executionResults: executionView(r?.executionResults),
  deliveryMetrics: m.cleanDelivery(r?.deliveryMetrics),
});

export const interview = async (req, res) => {
  const s = await loadStudent(req, res);
  if (!s) return;
  if (!isId(req.params.interviewId)) return fail(res, 404, 'Interview not found');
  const id = sid(s.student._id);
  const iv = await lecturerRepo.findInterview(s.institutionId, id, req.params.interviewId);
  if (!iv || sid(iv.userId) !== id) return fail(res, 404, 'Interview not found');
  await audit({ actor: req.user.id, action: 'lecturer.view_student', target: id, institutionId: s.institutionId, meta: { view: 'interview', interviewId: sid(iv._id) } });
  const responses = iv.responses || [];
  const used = new Set();
  const questions = (iv.questions || []).map((q) => {
    const idx = responses.findIndex((r, i) => !used.has(i) && r?.questionId === q.questionId);
    if (idx >= 0) used.add(idx);
    return answerView(q, idx >= 0 ? responses[idx] : null);
  });
  responses.forEach((r, i) => { if (!used.has(i)) questions.push(answerView(null, r)); });
  const scores = m.interviewScores(iv);
  const fb = iv.overallFeedback?.feedback || {};
  res.json({
    success: true,
    student: { id, name: s.student.name || '', email: s.student.email || '', group: s.student.group || '' },
    interview: {
      id: sid(iv._id), status: iv.status, createdAt: iso(iv.createdAt), startedAt: iso(iv.startedAt), completedAt: iso(iv.completedAt),
      jobDescription: typeof iv.jobDescription === 'string' ? iv.jobDescription : '',
      score: m.isCompleted(iv) ? scores.score : null, categoryScores: scores.categoryScores,
      storedOverallScore: typeof iv.overallFeedback?.score === 'number' ? iv.overallFeedback.score : null,
      readinessLevel: m.readinessOf(iv), excludedFallbackAnswers: scores.excludedFallbackAnswers,
      summary: {
        strengths: strList(fb.strengths), improvements: strList(fb.improvements), recommendations: strList(fb.recommendations),
        generalFeedback: typeof fb.generalFeedback === 'string' ? fb.generalFeedback : '',
      },
      delivery: m.studentDelivery([{ ...iv, status: 'completed' }]),
      questions,
    },
  });
};
