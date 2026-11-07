// Staff review queue for integrity cases, plus the student's view of their own escalated cases.
// Every evidence view and every change writes an AuditLog entry. Nothing here touches marks.
import assessmentRepo from '../repositories/assessmentRepo.js';
import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { isId, loadStaffCourse, staffCourseIds, canSeeCourse } from '../services/courseAccess.js';
import { CASE_STATUSES, CASE_OUTCOMES } from '../models/ReviewCase.js';
import { buildTimeline } from '../services/integrity/timeline.js';
import { analyseSession } from '../services/integrity/analysis.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const sid = (v) => String(v);

const MOVES = {
  open: ['dismissed', 'escalated', 'resolved'],
  escalated: ['dismissed', 'resolved'],
  dismissed: ['open'],
  resolved: ['open'],
};

const caseSummary = (c, { assessment, user } = {}) => ({
  id: sid(c._id), assessmentId: sid(c.assessmentId), assessmentTitle: assessment?.title || null, courseId: sid(c.courseId), sessionId: sid(c.sessionId),
  userId: sid(c.userId), studentName: user?.name || null, studentEmail: user?.email || null, status: c.status,
  reasonCodes: (c.reasons || []).map((r) => r.code), reasonCount: (c.reasons || []).length, reviewerId: c.reviewerId ? sid(c.reviewerId) : null,
  outcome: c.outcome || null, hasStudentResponse: !!c.studentResponse, createdAt: c.createdAt, updatedAt: c.updatedAt,
});

const caseDetail = (c, ctx) => ({
  ...caseSummary(c, ctx),
  reasons: c.reasons || [], technical: c.technical || {}, notes: c.notes || '', studentResponse: c.studentResponse || null,
  history: c.history || [],
});

const loadCase = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) { fail(res, 404, 'Case not found'); return null; }
  const c = await assessmentRepo.findCase(institutionId, req.params.id);
  if (!c || !(await loadStaffCourse(req, c.courseId))) { fail(res, 404, 'Case not found'); return null; }
  return c;
};

const auditCase = (req, action, c, meta = {}) => audit({
  actor: req.user.id, action, target: c._id, institutionId: institutionOf(req),
  meta: { assessmentId: sid(c.assessmentId), sessionId: sid(c.sessionId), studentId: sid(c.userId), ...meta },
});

// GET /api/integrity/cases?status=&assessmentId=&courseId=&userId=
export const listCases = async (req, res) => {
  const institutionId = institutionOf(req);
  const { status, assessmentId, courseId, userId } = req.query;
  const filter = {};
  if (status !== undefined) {
    const wanted = String(status).split(',');
    if (!wanted.every((s) => CASE_STATUSES.includes(s))) return fail(res, 400, `status must be one of ${CASE_STATUSES.join(', ')}`);
    filter.status = wanted;
  }
  for (const [k, v] of Object.entries({ assessmentId, userId })) {
    if (v === undefined) continue;
    if (!isId(v)) return res.json({ success: true, cases: [] });
    filter[k] = v;
  }
  let courseIds = await staffCourseIds(req); // null = every course in the university (admin)
  if (courseId !== undefined) {
    if (!isId(courseId) || !canSeeCourse(courseIds, courseId)) return res.json({ success: true, cases: [] });
    courseIds = [String(courseId)];
  }
  const cases = await assessmentRepo.listCases(institutionId, { ...filter, ...(courseIds ? { courseIds } : {}) });
  const assessments = await assessmentRepo.listAssessments(institutionId, courseIds ? { courseIds } : {});
  const users = cases.length ? await courseRepo.findUsersByIds(institutionId, [...new Set(cases.map((c) => sid(c.userId)))]) : [];
  res.json({
    success: true,
    cases: cases.map((c) => caseSummary(c, {
      assessment: assessments.find((a) => sid(a._id) === sid(c.assessmentId)), user: users.find((u) => sid(u._id) === sid(c.userId)),
    })),
  });
};

// GET /api/integrity/cases/:id  (audited: this is the evidence view)
export const getCase = async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const institutionId = institutionOf(req);
  const [assessment, users, timeline, pairs] = await Promise.all([
    assessmentRepo.findAssessment(institutionId, c.assessmentId),
    courseRepo.findUsersByIds(institutionId, [c.userId]),
    buildTimeline(c.sessionId, institutionId),
    assessmentRepo.listSimilarity(institutionId, { sessionId: c.sessionId, flaggedOnly: true }),
  ]);
  await auditCase(req, 'integrity.view', c);
  const mine = (p) => sid(p.sessionAId) === sid(c.sessionId);
  res.json({
    success: true,
    case: caseDetail(c, { assessment, user: users[0] }),
    timeline: timeline ? { startedAt: timeline.startedAt, items: timeline.items, truncated: timeline.truncated } : null,
    similarity: pairs.map((p) => ({
      id: sid(p._id), questionId: sid(p.questionId), otherSessionId: mine(p) ? sid(p.sessionBId) : sid(p.sessionAId),
      otherUserId: mine(p) ? sid(p.userBId) : sid(p.userAId), containment: p.containment, jaccard: p.jaccard,
      sharedFingerprints: p.sharedFingerprints, ranges: mine(p) ? p.rangesA : p.rangesB,
    })),
  });
};

// PATCH /api/integrity/cases/:id  { status?, outcome?, notes? }
export const updateCase = async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const { status, outcome, notes } = req.body || {};
  const patch = {};
  if (status !== undefined) {
    if (!CASE_STATUSES.includes(status)) return fail(res, 400, `status must be one of ${CASE_STATUSES.join(', ')}`);
    if (status !== c.status && !MOVES[c.status].includes(status)) return fail(res, 409, `A ${c.status} case cannot move to ${status}`);
    patch.status = status;
  }
  if (outcome !== undefined) {
    if (outcome !== null && !CASE_OUTCOMES.includes(outcome)) return fail(res, 400, `outcome must be one of ${CASE_OUTCOMES.join(', ')}`);
    patch.outcome = outcome;
  }
  if (notes !== undefined) {
    if (typeof notes !== 'string' || notes.length > 4000) return fail(res, 400, 'notes must be text of at most 4000 characters');
    patch.notes = notes;
  }
  if (!Object.keys(patch).length) return fail(res, 400, 'Nothing to change');
  const finalStatus = patch.status || c.status;
  const finalOutcome = patch.outcome !== undefined ? patch.outcome : c.outcome;
  if (finalStatus === 'resolved' && !finalOutcome) return fail(res, 400, 'A resolved case needs an outcome');
  if (patch.status === 'dismissed' && !finalOutcome) patch.outcome = 'no_action';
  if (patch.status === 'open' && c.status !== 'open') patch.outcome = null; // reopened
  patch.reviewerId = req.user.id;
  const changedStatus = patch.status && patch.status !== c.status;
  const updated = await assessmentRepo.updateCase(institutionOf(req), c._id, {
    $set: patch,
    $push: { history: { at: new Date(), by: sid(req.user.id), action: changedStatus ? 'status_changed' : 'edited', from: c.status, to: finalStatus } },
  });
  await auditCase(req, 'integrity.update', c, { fields: Object.keys(patch).filter((k) => k !== 'reviewerId'), from: c.status, to: finalStatus, outcome: updated.outcome });
  res.json({ success: true, case: caseDetail(updated) });
};

// POST /api/integrity/sessions/:id/analyse  (re-run the flagging rules for one session)
export const analyseOneSession = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) return fail(res, 404, 'Session not found');
  const session = await assessmentRepo.findSession(institutionId, req.params.id);
  if (!session || !(await loadStaffCourse(req, session.courseId))) return fail(res, 404, 'Session not found');
  const r = await analyseSession(institutionId, session._id);
  await audit({ actor: req.user.id, action: 'integrity.analyse', target: session._id, institutionId, meta: { assessmentId: sid(session.assessmentId), reasons: r?.reasons?.length || 0 } });
  res.json({ success: true, reasons: r?.reasons || [], technical: r?.technical || {}, caseId: r?.case ? sid(r.case._id) : null });
};

// POST /api/integrity/assessments/:id/analyse  (every session of the assessment, e.g. after changing thresholds)
export const analyseAssessment = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) return fail(res, 404, 'Assessment not found');
  const a = await assessmentRepo.findAssessment(institutionId, req.params.id);
  if (!a || !(await loadStaffCourse(req, a.courseId))) return fail(res, 404, 'Assessment not found');
  const sessions = await assessmentRepo.listSessions(institutionId, { assessmentId: a._id });
  let withCases = 0;
  for (const s of sessions) { const r = await analyseSession(institutionId, s._id); if (r?.case) withCases += 1; }
  await audit({ actor: req.user.id, action: 'integrity.analyse', target: a._id, institutionId, meta: { sessions: sessions.length, withCases } });
  res.json({ success: true, sessions: sessions.length, sessionsWithCases: withCases });
};

// ================================================================ student: own escalated cases
const studentCaseView = (c, assessment) => ({
  id: sid(c._id), assessmentId: sid(c.assessmentId), assessmentTitle: assessment?.title || null, status: c.status,
  reasons: (c.reasons || []).filter((r) => r.kind !== 'technical').map((r) => ({ code: r.code, kind: r.kind, text: r.text })),
  studentResponse: c.studentResponse || null, escalatedAt: [...(c.history || [])].reverse().find((h) => h.to === 'escalated')?.at || null,
});

const loadMyCase = async (req, res) => {
  const institutionId = institutionOf(req);
  const c = isId(req.params.id) ? await assessmentRepo.findCase(institutionId, req.params.id) : null;
  // Another student's case, a case that is not escalated and a missing case are indistinguishable.
  if (!c || sid(c.userId) !== sid(req.user.id) || c.status !== 'escalated') { fail(res, 404, 'Case not found'); return null; }
  return c;
};

export const myCases = async (req, res) => {
  const institutionId = institutionOf(req);
  const cases = await assessmentRepo.listCases(institutionId, { userId: req.user.id, status: 'escalated' });
  const out = [];
  for (const c of cases) out.push(studentCaseView(c, await assessmentRepo.findAssessment(institutionId, c.assessmentId)));
  res.json({ success: true, cases: out });
};

export const myCase = async (req, res) => {
  const c = await loadMyCase(req, res);
  if (!c) return;
  res.json({ success: true, case: studentCaseView(c, await assessmentRepo.findAssessment(institutionOf(req), c.assessmentId)) });
};

export const respondToCase = async (req, res) => {
  const c = await loadMyCase(req, res);
  if (!c) return;
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return fail(res, 400, 'text is required (max 4000 characters)');
  const institutionId = institutionOf(req);
  const updated = await assessmentRepo.updateCase(institutionId, c._id, {
    $set: { studentResponse: { text: text.trim(), at: new Date() } },
    $push: { history: { at: new Date(), by: sid(req.user.id), action: 'student_response', from: c.status, to: c.status } },
  });
  await audit({ actor: req.user.id, action: 'integrity.student_response', target: c._id, institutionId, meta: { assessmentId: sid(c.assessmentId) } });
  res.status(201).json({ success: true, case: studentCaseView(updated, await assessmentRepo.findAssessment(institutionId, c.assessmentId)) });
};
