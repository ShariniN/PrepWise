// Dashboard: how the caller's students do in mock interviews, CV analysis and practice.
// Scoped by role (see scopeFor): admins see their whole university, lecturers only the groups assigned to them.
// Always the caller's own university and active students. Every view of one student's data is audited.
// Responses are built from whitelists: CV text, passwords, OTPs, invite tokens, hidden tests and the question pool never leave.
import { institutionOf } from '../../middleware/tenancy.js';
import { audit } from '../../services/audit.js';
import { fail, isId, intParam } from '../../services/http.js';
import { toCsv } from '../../services/csv.js';
import { cleanGroup, InvalidGroupError } from '../../services/groups.js';
import { getUsage } from '../people/people.service.js';
import dashboardRepo, { scopeFor } from './dashboard.repo.js';
import * as m from './dashboard.metrics.js';

const sid = (v) => String(v);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const strList = (xs, max = 20) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string').slice(0, max) : []);
const sorted = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
const groupBy = (rows) => {
  const out = new Map();
  for (const r of rows) {
    const k = sid(r.userId);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
};

// The caller's scope, narrowed by ?group=. Sends a 400 (bad group) or 403 (group outside a lecturer's scope) and
// returns null, or returns:
//   institutionId; assigned: null (admin, every group) or the lecturer's groups;
//   groups: what to load (null = every group); group: the cleaned ?group= or ''; noGroupsAssigned.
const scopeOf = (req, res) => {
  const { groups: assigned } = scopeFor(req.user);
  let group = '';
  try {
    group = typeof req.query.group === 'string' ? cleanGroup(req.query.group) : '';
  } catch (error) {
    if (error instanceof InvalidGroupError) { fail(res, 400, error.message, { code: error.code }); return null; }
    throw error;
  }
  if (group && assigned !== null && !assigned.includes(group)) {
    fail(res, 403, 'This group is not assigned to you. Ask your administrator to assign it.', { code: 'GROUP_NOT_ASSIGNED' });
    return null;
  }
  return {
    institutionId: institutionOf(req), assigned, group,
    groups: group ? [group] : assigned,
    noGroupsAssigned: assigned !== null && assigned.length === 0,
  };
};

// Loads every active student in scope with their data, and builds the table rows.
const loadRows = async (scope, institution, now) => {
  if (scope.groups !== null && !scope.groups.length) return [];
  const { institutionId } = scope;
  const students = await dashboardRepo.listStudents(institutionId, scope.groups);
  const ids = students.map((s) => sid(s._id));
  const [interviews, cvs, attempts] = await Promise.all([
    dashboardRepo.interviewsFor(institutionId, ids),
    dashboardRepo.cvAnalysesFor(institutionId, ids),
    dashboardRepo.attemptsFor(institutionId, ids),
  ]);
  const iv = groupBy(interviews); const cv = groupBy(cvs); const at = groupBy(attempts);
  return students.map((s) => m.studentRow(s, { interviews: iv.get(sid(s._id)) || [], cvAnalyses: cv.get(sid(s._id)) || [], attempts: at.get(sid(s._id)) || [] }, now, institution));
};

// Students count against the contract while invited or active, as on Manage people.
const seatsOf = async (institution) => {
  const u = await getUsage(institution);
  return { used: u.activeStudents + u.invitedStudents, limit: u.studentLimit, invited: u.invitedStudents };
};

// ---------------------------------------------------------------- GET /overview
export const overview = async (req, res) => {
  const scope = scopeOf(req, res);
  if (!scope) return;
  const now = new Date();
  const isAdmin = scope.assigned === null;
  const institution = await dashboardRepo.getInstitution(scope.institutionId);
  const [rows, groups] = await Promise.all([
    loadRows(scope, institution, now),
    isAdmin ? dashboardRepo.distinctGroups(scope.institutionId) : scope.assigned,
  ]);
  res.json({
    success: true, noGroupsAssigned: scope.noGroupsAssigned, group: scope.group || null, groups: sorted(groups), generatedAt: now.toISOString(),
    ...m.overview(rows, now),
    ...(isAdmin ? { seats: institution ? await seatsOf(institution) : null } : {}),
  });
};

// ---------------------------------------------------------------- GET /students
const tableRows = async (req, res) => {
  const scope = scopeOf(req, res);
  if (!scope) return null;
  const sort = m.parseSort(req.query.sort);
  if (!sort) { fail(res, 400, `sort must be one of: ${m.SORT_KEYS.join(', ')} (prefix with - for descending)`); return null; }
  const attention = typeof req.query.attention === 'string' && req.query.attention ? req.query.attention : null;
  if (attention && !m.ATTENTION_CODES.includes(attention)) { fail(res, 400, `attention must be one of: ${m.ATTENTION_CODES.join(', ')}`); return null; }
  const institution = scope.noGroupsAssigned ? null : await dashboardRepo.getInstitution(scope.institutionId);
  let rows = await loadRows(scope, institution, new Date());
  rows = m.searchRows(rows, typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '');
  if (req.query.needsAttention === '1' || req.query.needsAttention === 'true') rows = rows.filter((r) => r.attention.length);
  if (attention) rows = rows.filter((r) => r.attention.some((x) => x.code === attention));
  return { rows: m.sortRows(rows, sort), sort, scope };
};

export const students = async (req, res) => {
  const t = await tableRows(req, res);
  if (!t) return;
  const pageSize = intParam(req.query.pageSize, 25, 1, 100);
  const total = t.rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = intParam(req.query.page, 1, 1, 100000);
  res.json({
    success: true, noGroupsAssigned: t.scope.noGroupsAssigned, students: t.rows.slice((page - 1) * pageSize, page * pageSize),
    page, pageSize, total, totalPages, sort: `${t.sort.desc ? '-' : ''}${t.sort.key}`, group: t.scope.group || null,
  });
};

// ---------------------------------------------------------------- GET /students.csv
export const studentsCsv = async (req, res) => {
  const t = await tableRows(req, res);
  if (!t) return;
  const header = ['id', 'name', 'email', 'group', 'target_role', 'cv_score', 'last_interview_score', 'last_level_reached', 'trend',
    'practice_solved', 'last_active', 'attention'];
  const lines = t.rows.map((r) => [r.id, r.name, r.email, r.group, r.targetRoleTitle, r.cvScore, r.lastInterviewScore, r.lastLevelReached,
    r.trend.join(';'), r.practiceSolved, r.lastActive, r.attention.map((x) => x.code).join(';')]);
  await audit({ actor: req.user.id, action: 'lecturer.export_students', institutionId: t.scope.institutionId, meta: { rows: lines.length, group: t.scope.group || null } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
  res.send(toCsv(header, lines));
};

// ---------------------------------------------------------------- GET /students/:id
// A student outside the caller's university or groups is a 404, the same as one that does not exist.
const loadStudent = async (req, res) => {
  if (!isId(req.params.id)) { fail(res, 404, 'Student not found'); return null; }
  const { groups } = scopeFor(req.user);
  const institutionId = institutionOf(req);
  const student = groups !== null && !groups.length ? null : await dashboardRepo.findStudent(institutionId, req.params.id, groups);
  if (!student) { fail(res, 404, 'Student not found'); return null; }
  return { institutionId, student };
};

const cvResultView = (r, analysis) => {
  const b = r.scoreBreakdown && typeof r.scoreBreakdown === 'object' ? r.scoreBreakdown : null;
  const jd = Array.isArray(analysis.jobDescriptions) ? analysis.jobDescriptions[r.jobIndex ?? 0] : '';
  return {
    kind: m.resultKind(r),
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
    levelReached: m.levelOf(iv.levelReached),
    answered: s.answered, skipped: s.skipped, excludedFallbackAnswers: s.excludedFallbackAnswers,
  };
};

export const student = async (req, res) => {
  const s = await loadStudent(req, res);
  if (!s) return;
  const { institutionId, student: u } = s;
  const id = sid(u._id);
  const [interviews, cvs, attempts, institution] = await Promise.all([
    dashboardRepo.interviewsFor(institutionId, [id]),
    dashboardRepo.cvAnalysesFor(institutionId, [id]),
    dashboardRepo.attemptsFor(institutionId, [id]),
    dashboardRepo.getInstitution(institutionId),
  ]);
  const mine = (xs) => xs.filter((x) => sid(x.userId) === id); // defence in depth
  const ivs = mine(interviews); const cv = mine(cvs); const at = mine(attempts);
  const row = m.studentRow(u, { interviews: ivs, cvAnalyses: cv, attempts: at }, new Date(), institution);
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
  level: m.levelOf(q?.level),
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
  const iv = await dashboardRepo.findInterview(s.institutionId, id, req.params.interviewId);
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
      readinessLevel: m.readinessOf(iv), levelReached: m.levelOf(iv.levelReached), excludedFallbackAnswers: scores.excludedFallbackAnswers,
      summary: {
        strengths: strList(fb.strengths), improvements: strList(fb.improvements), recommendations: strList(fb.recommendations),
        generalFeedback: typeof fb.generalFeedback === 'string' ? fb.generalFeedback : '',
      },
      delivery: m.studentDelivery([{ ...iv, status: 'completed' }]),
      questions,
    },
  });
};
