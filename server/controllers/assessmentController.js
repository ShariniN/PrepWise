// Assessments: lecturers/admins build and manage them; students list, start, answer and finish them.
// The server owns the clock: the deadline is fixed when the session starts and every write is checked against it.
import assessmentRepo from '../repositories/assessmentRepo.js';
import questionRepo from '../repositories/questionRepo.js';
import courseRepo from '../repositories/courseRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { isId, loadStaffCourse, staffCourseIds, canSeeCourse } from '../services/courseAccess.js';
import { studentQuestion } from '../services/questionSerializers.js';
import { runForQuestion, submitForQuestion, cleanEvents, EVENT_LIMITS, CODE_TYPES } from '../services/practiceCore.js';
import { MAX_SOURCE_CHARS } from '../services/execution/index.js';
import { normalizeLanguage } from '../services/execution/languages.js';
import {
  effectiveStatus, computeBaseDeadline, sessionDeadline, sessionWriteBlock, remainingSeconds, accommodationFor,
  pickVariant, orderSlots,
} from '../services/assessments/rules.js';
import { INTEGRITY_SIGNALS } from '../models/Assessment.js';
import { sanitizeThresholds, effectiveThresholds } from '../services/integrity/thresholds.js';
import { onSessionFinished } from '../services/integrity/hooks.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const send = (res, result) => res.status(result.status).json(result.body);
const sid = (v) => String(v);
const toDate = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const MAX_QUESTIONS = 50;

// ---------------------------------------------------------------- views
const staffView = (a, now = new Date()) => ({
  id: sid(a._id), courseId: sid(a.courseId), cohortId: a.cohortId ? sid(a.cohortId) : null, createdBy: sid(a.createdBy),
  title: a.title, instructions: a.instructions || '', questionIds: (a.questionIds || []).map(sid),
  opensAt: a.opensAt, closesAt: a.closesAt, durationMinutes: a.durationMinutes, attemptsAllowed: a.attemptsAllowed,
  integrityLevel: a.integrityLevel, shuffleQuestions: a.shuffleQuestions !== false,
  status: a.status, effectiveStatus: effectiveStatus(a, now), releaseResults: !!a.releaseResults,
  accommodations: (a.accommodations || []).map((x) => ({
    userId: sid(x.userId), extraTimePercent: x.extraTimePercent || 0, disabledSignals: x.disabledSignals || [], note: x.note || '',
  })),
  flagThresholds: a.flagThresholds || {}, effectiveThresholds: effectiveThresholds(a), updatedAt: a.updatedAt,
});

const sessionStudentView = (s, a, titles, now = new Date()) => ({
  id: sid(s._id), assessmentId: sid(s.assessmentId), title: a.title, attemptNo: s.attemptNo, status: s.status,
  serverStartedAt: s.serverStartedAt, deadline: sessionDeadline(s), serverNow: now, remainingSeconds: s.status === 'active' ? remainingSeconds(s, now) : 0,
  submittedAt: s.submittedAt || null, integrityLevel: s.integrityLevel,
  // Signals the browser should report (empty at level 0 or when an accommodation disables them all).
  signals: s.integrityLevel >= 1 ? INTEGRITY_SIGNALS.filter((x) => !(s.disabledSignals || []).includes(x)) : [],
  releaseResults: !!a.releaseResults,
  questions: (s.questions || []).map((q, index) => ({
    index, questionId: sid(q.questionId), title: titles[sid(q.questionId)]?.title || '', type: titles[sid(q.questionId)]?.type || '',
  })),
});

const questionTitles = async (institutionId, session) => {
  const out = {};
  for (const q of session.questions || []) {
    const doc = await questionRepo.findVisible(institutionId, q.questionId);
    if (doc) out[sid(q.questionId)] = { title: doc.title, type: doc.type };
  }
  return out;
};

// ---------------------------------------------------------------- staff: validation
const checkQuestions = async (institutionId, ids) => {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_QUESTIONS) return `questionIds must list 1 to ${MAX_QUESTIONS} questions`;
  if (new Set(ids.map(sid)).size !== ids.length) return 'questionIds must not repeat a question';
  for (const id of ids) {
    if (!isId(id)) return 'questionIds must be question ids';
    const q = await questionRepo.findVisible(institutionId, id);
    if (!q || q.status !== 'published') return `Question ${id} was not found or is not published`;
  }
  return null;
};

const parseFields = (b, { creating }) => {
  const f = {};
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200) return { error: 'title is required (max 200 characters)' };
    f.title = b.title.trim();
  } else if (creating) return { error: 'title is required' };
  if (b.instructions !== undefined) f.instructions = String(b.instructions).slice(0, 5000);
  for (const k of ['opensAt', 'closesAt']) {
    if (b[k] !== undefined) {
      const d = toDate(b[k]);
      if (!d) return { error: `${k} must be a date` };
      f[k] = d;
    } else if (creating) return { error: `${k} is required` };
  }
  if (b.durationMinutes !== undefined) {
    if (!Number.isInteger(b.durationMinutes) || b.durationMinutes < 1 || b.durationMinutes > 600) return { error: 'durationMinutes must be a whole number from 1 to 600' };
    f.durationMinutes = b.durationMinutes;
  } else if (creating) return { error: 'durationMinutes is required' };
  if (b.attemptsAllowed !== undefined) {
    if (!Number.isInteger(b.attemptsAllowed) || b.attemptsAllowed < 1 || b.attemptsAllowed > 5) return { error: 'attemptsAllowed must be a whole number from 1 to 5' };
    f.attemptsAllowed = b.attemptsAllowed;
  }
  if (b.integrityLevel !== undefined) {
    if (b.integrityLevel === 2 || b.integrityLevel === 3) return { error: 'Integrity levels 2 and 3 are not available yet (planned for a later phase). Use 0 or 1.' };
    if (b.integrityLevel !== 0 && b.integrityLevel !== 1) return { error: 'integrityLevel must be 0 or 1' };
    f.integrityLevel = b.integrityLevel;
  }
  for (const k of ['shuffleQuestions', 'releaseResults']) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== 'boolean') return { error: `${k} must be true or false` };
      f[k] = b[k];
    }
  }
  const th = sanitizeThresholds(b.flagThresholds);
  if (th.error) return { error: th.error };
  if (th.clean) f.flagThresholds = th.clean;
  return { fields: f };
};

// Loads an assessment the staff member may manage, or sends 404.
const loadStaffAssessment = async (req, res) => {
  if (!isId(req.params.id)) { fail(res, 404, 'Assessment not found'); return null; }
  const a = await assessmentRepo.findAssessment(institutionOf(req), req.params.id);
  if (!a || !(await loadStaffCourse(req, a.courseId))) { fail(res, 404, 'Assessment not found'); return null; }
  return a;
};

// ---------------------------------------------------------------- staff handlers
export const createAssessment = async (req, res) => {
  const institutionId = institutionOf(req);
  const b = req.body || {};
  const course = await loadStaffCourse(req, b.courseId);
  if (!course) return fail(res, 404, 'Course not found');
  let cohortId = null;
  if (b.cohortId) {
    const cohort = isId(b.cohortId) ? await courseRepo.findCohort(institutionId, course._id, b.cohortId) : null;
    if (!cohort) return fail(res, 404, 'Cohort not found');
    cohortId = cohort._id;
  }
  const parsed = parseFields(b, { creating: true });
  if (parsed.error) return fail(res, 400, parsed.error);
  const f = parsed.fields;
  if (f.closesAt <= f.opensAt) return fail(res, 400, 'closesAt must be after opensAt');
  const qError = await checkQuestions(institutionId, b.questionIds);
  if (qError) return fail(res, 400, qError);
  const a = await assessmentRepo.createAssessment({
    ...f, institutionId, courseId: course._id, cohortId, createdBy: req.user.id, questionIds: b.questionIds,
    attemptsAllowed: f.attemptsAllowed ?? 1, integrityLevel: f.integrityLevel ?? 0, shuffleQuestions: f.shuffleQuestions ?? true,
    releaseResults: f.releaseResults ?? false, status: 'draft', accommodations: [],
  });
  await audit({ actor: req.user.id, action: 'assessment.create', target: a._id, institutionId, meta: { courseId: sid(course._id) } });
  res.status(201).json({ success: true, assessment: staffView(a) });
};

export const listAssessments = async (req, res) => {
  const institutionId = institutionOf(req);
  const now = new Date();
  if (req.user.role === 'student') {
    const enrolments = await courseRepo.findEnrollments(institutionId, 'student', { userId: req.user.id });
    const courseIds = [...new Set(enrolments.map((e) => sid(e.courseId)))];
    if (!courseIds.length) return res.json({ success: true, assessments: [] });
    const cohortIds = new Set(enrolments.map((e) => sid(e.cohortId)));
    const list = (await assessmentRepo.listAssessments(institutionId, { courseIds, notDraft: true }))
      .filter((a) => !a.cohortId || cohortIds.has(sid(a.cohortId)));
    const sessions = await assessmentRepo.listSessions(institutionId, { assessmentIds: list.map((a) => a._id), userId: req.user.id });
    return res.json({ success: true, assessments: list.map((a) => studentSummary(a, sessions.filter((s) => sid(s.assessmentId) === sid(a._id)), now)) });
  }
  const courseIds = await staffCourseIds(req);
  const list = await assessmentRepo.listAssessments(institutionId, courseIds ? { courseIds } : {});
  res.json({ success: true, assessments: list.map((a) => staffView(a, now)) });
};

const studentSummary = (a, mySessions, now) => {
  const status = effectiveStatus(a, now);
  return {
    id: sid(a._id), courseId: sid(a.courseId), cohortId: a.cohortId ? sid(a.cohortId) : null, title: a.title, instructions: a.instructions || '',
    opensAt: a.opensAt, closesAt: a.closesAt, durationMinutes: a.durationMinutes, attemptsAllowed: a.attemptsAllowed,
    integrityLevel: a.integrityLevel, questionCount: (a.questionIds || []).length, status, releaseResults: !!a.releaseResults,
    canStart: status === 'open' && (mySessions.length < a.attemptsAllowed || mySessions.some((s) => s.status === 'active')),
    sessions: mySessions.map((s) => ({ id: sid(s._id), attemptNo: s.attemptNo, status: s.status, serverStartedAt: s.serverStartedAt, deadline: sessionDeadline(s), submittedAt: s.submittedAt || null })),
  };
};

// Is this student part of the assessment's course (and cohort, if it has one)?
const studentEnrolled = async (institutionId, a, userId) => {
  const rows = await courseRepo.findEnrollments(institutionId, 'student', { userId, courseId: a.courseId });
  return rows.some((e) => !a.cohortId || sid(e.cohortId) === sid(a.cohortId));
};

export const getAssessment = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) return fail(res, 404, 'Assessment not found');
  const a = await assessmentRepo.findAssessment(institutionId, req.params.id);
  if (!a) return fail(res, 404, 'Assessment not found');
  if (req.user.role === 'student') {
    if (a.status === 'draft' || !(await studentEnrolled(institutionId, a, req.user.id))) return fail(res, 404, 'Assessment not found');
    const mine = await assessmentRepo.listSessions(institutionId, { assessmentId: a._id, userId: req.user.id });
    return res.json({ success: true, assessment: studentSummary(a, mine, new Date()) });
  }
  if (!(await loadStaffCourse(req, a.courseId))) return fail(res, 404, 'Assessment not found');
  const titles = [];
  for (const id of a.questionIds) { const q = await questionRepo.findVisible(institutionId, id); titles.push({ id: sid(id), title: q?.title || '(missing)', type: q?.type || null }); }
  res.json({ success: true, assessment: { ...staffView(a), questions: titles } });
};

const sessionsOf = (institutionId, a) => assessmentRepo.listSessions(institutionId, { assessmentId: a._id });

export const updateAssessment = async (req, res) => {
  const a = await loadStaffAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  const status = effectiveStatus(a);
  if (status === 'closed') return fail(res, 409, 'A closed assessment cannot be edited');
  const started = (await sessionsOf(institutionId, a)).length > 0;
  const b = req.body || {};
  if (started && ['questionIds', 'durationMinutes', 'opensAt', 'closesAt', 'attemptsAllowed', 'integrityLevel', 'shuffleQuestions', 'cohortId'].some((k) => b[k] !== undefined)) {
    return fail(res, 409, 'Students have already started. Only the title, instructions, releaseResults and flagThresholds can change now.');
  }
  const parsed = parseFields(b, { creating: false });
  if (parsed.error) return fail(res, 400, parsed.error);
  const patch = { ...parsed.fields };
  if (b.cohortId !== undefined) {
    if (b.cohortId === null) patch.cohortId = null;
    else {
      const cohort = isId(b.cohortId) ? await courseRepo.findCohort(institutionId, a.courseId, b.cohortId) : null;
      if (!cohort) return fail(res, 404, 'Cohort not found');
      patch.cohortId = cohort._id;
    }
  }
  if (b.questionIds !== undefined) {
    const qError = await checkQuestions(institutionId, b.questionIds);
    if (qError) return fail(res, 400, qError);
    patch.questionIds = b.questionIds;
  }
  const opens = patch.opensAt || a.opensAt;
  const closes = patch.closesAt || a.closesAt;
  if (new Date(closes) <= new Date(opens)) return fail(res, 400, 'closesAt must be after opensAt');
  if (!Object.keys(patch).length) return fail(res, 400, 'Nothing to change');
  const updated = await assessmentRepo.updateAssessment(institutionId, a._id, patch);
  await audit({ actor: req.user.id, action: 'assessment.update', target: a._id, institutionId, meta: { fields: Object.keys(patch) } });
  res.json({ success: true, assessment: staffView(updated) });
};

// draft -> scheduled, scheduled -> draft (before anyone started), scheduled/open -> closed, scheduled -> open (open now).
export const setStatus = async (req, res) => {
  const a = await loadStaffAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  const to = req.body?.status;
  const now = new Date();
  const from = effectiveStatus(a, now);
  if (!['draft', 'scheduled', 'open', 'closed'].includes(to)) return fail(res, 400, 'status must be draft, scheduled, open or closed');
  const MOVES = { draft: ['scheduled', 'open'], scheduled: ['draft', 'open', 'closed'], open: ['closed'], closed: [] };
  if (!MOVES[from].includes(to)) return fail(res, 409, `Cannot move from ${from} to ${to}`);
  const patch = { status: to };
  if (to === 'scheduled' || to === 'open') {
    const qError = await checkQuestions(institutionId, (a.questionIds || []).map(sid));
    if (qError) return fail(res, 409, `Cannot publish: ${qError}`, { code: 'PUBLISH_BLOCKED' });
    if (new Date(a.closesAt) <= now) return fail(res, 409, 'The close time is already in the past', { code: 'PUBLISH_BLOCKED' });
    if (to === 'open' && new Date(a.opensAt) > now) patch.opensAt = now;
  }
  if (to === 'draft') {
    if ((await sessionsOf(institutionId, a)).length) return fail(res, 409, 'Students have already started; close it instead');
  }
  const updated = await assessmentRepo.updateAssessment(institutionId, a._id, patch);
  if (to === 'closed') await assessmentRepo.closeSessionWindows(institutionId, a._id, now);
  await audit({ actor: req.user.id, action: 'assessment.status', target: a._id, institutionId, meta: { from, to } });
  res.json({ success: true, assessment: staffView(updated) });
};

export const setAccommodation = async (req, res) => {
  const a = await loadStaffAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  if (!isId(req.params.userId)) return fail(res, 404, 'Student not found');
  if (!(await studentEnrolled(institutionId, a, req.params.userId))) return fail(res, 404, 'Student not found');
  const { extraTimePercent = 0, disabledSignals = [], note = '' } = req.body || {};
  if (typeof extraTimePercent !== 'number' || !(extraTimePercent >= 0 && extraTimePercent <= 200)) return fail(res, 400, 'extraTimePercent must be a number from 0 to 200');
  if (!Array.isArray(disabledSignals) || disabledSignals.some((s) => !INTEGRITY_SIGNALS.includes(s))) {
    return fail(res, 400, `disabledSignals may only contain: ${INTEGRITY_SIGNALS.join(', ')}`);
  }
  const entry = { userId: req.params.userId, extraTimePercent, disabledSignals: [...new Set(disabledSignals)], note: String(note).slice(0, 300) };
  const rest = (a.accommodations || []).filter((x) => sid(x.userId) !== sid(req.params.userId));
  const updated = await assessmentRepo.updateAssessment(institutionId, a._id, { accommodations: [...rest, entry] });
  await audit({ actor: req.user.id, action: 'assessment.accommodation', target: a._id, institutionId, meta: { studentId: req.params.userId, extraTimePercent, disabledSignals: entry.disabledSignals } });
  res.json({ success: true, assessment: staffView(updated) });
};

export const removeAccommodation = async (req, res) => {
  const a = await loadStaffAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  const rest = (a.accommodations || []).filter((x) => sid(x.userId) !== sid(req.params.userId));
  if (rest.length === (a.accommodations || []).length) return fail(res, 404, 'No accommodation for this student');
  const updated = await assessmentRepo.updateAssessment(institutionId, a._id, { accommodations: rest });
  await audit({ actor: req.user.id, action: 'assessment.accommodation', target: a._id, institutionId, meta: { studentId: req.params.userId, removed: true } });
  res.json({ success: true, assessment: staffView(updated) });
};

export const listSessions = async (req, res) => {
  const a = await loadStaffAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  const sessions = await sessionsOf(institutionId, a);
  const users = sessions.length ? await courseRepo.findUsersByIds(institutionId, [...new Set(sessions.map((s) => sid(s.userId)))]) : [];
  const cases = await assessmentRepo.listCases(institutionId, { assessmentId: a._id });
  const now = new Date();
  res.json({
    success: true,
    sessions: sessions.map((s) => {
      const u = users.find((x) => sid(x._id) === sid(s.userId));
      const c = cases.find((x) => sid(x.sessionId) === sid(s._id));
      return {
        id: sid(s._id), userId: sid(s.userId), studentName: u?.name || null, studentEmail: u?.email || null, attemptNo: s.attemptNo, status: s.status,
        serverStartedAt: s.serverStartedAt, baseDeadline: s.baseDeadline, deadline: sessionDeadline(s), extensionMs: s.extensionMs || 0,
        extensions: (s.extensions || []).map((e) => ({ minutes: e.minutes, reason: e.reason, at: e.at, byUserId: e.byUserId ? sid(e.byUserId) : null })),
        extraTimePercent: s.extraTimePercent || 0, submittedAt: s.submittedAt || null,
        timedOut: s.status === 'active' && remainingSeconds(s, now) === 0, caseId: c ? sid(c._id) : null, caseStatus: c?.status || null,
      };
    }),
  });
};

export const extendSession = async (req, res) => {
  const a = await loadStaffAssessment(req, res);
  if (!a) return;
  const institutionId = institutionOf(req);
  if (!isId(req.params.sessionId)) return fail(res, 404, 'Session not found');
  const s = await assessmentRepo.findSession(institutionId, req.params.sessionId);
  if (!s || sid(s.assessmentId) !== sid(a._id)) return fail(res, 404, 'Session not found');
  if (s.status !== 'active') return fail(res, 409, 'This session was already submitted');
  if (a.status === 'closed') return fail(res, 409, 'The assessment was closed');
  const { minutes, reason } = req.body || {};
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) return fail(res, 400, 'minutes must be a whole number from 1 to 480');
  if (typeof reason !== 'string' || reason.trim().length < 3) return fail(res, 400, 'A reason is required');
  const before = sessionDeadline(s);
  const updated = await assessmentRepo.updateSession(institutionId, s._id, {
    $inc: { extensionMs: minutes * 60 * 1000 },
    $push: { extensions: { byUserId: req.user.id, minutes, reason: reason.trim().slice(0, 300), at: new Date() } },
  });
  await audit({
    actor: req.user.id, action: 'assessment.extend', target: s._id, institutionId,
    meta: { assessmentId: sid(a._id), studentId: sid(s.userId), minutes, reason: reason.trim().slice(0, 300), previousDeadline: before, newDeadline: sessionDeadline(updated) },
  });
  res.json({ success: true, session: { id: sid(updated._id), deadline: sessionDeadline(updated), extensionMs: updated.extensionMs } });
};

// ---------------------------------------------------------------- student handlers
export const startSession = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) return fail(res, 404, 'Assessment not found');
  const a = await assessmentRepo.findAssessment(institutionId, req.params.id);
  if (!a || a.status === 'draft' || !(await studentEnrolled(institutionId, a, req.user.id))) return fail(res, 404, 'Assessment not found');
  const now = new Date();
  const status = effectiveStatus(a, now);
  if (status !== 'open') return fail(res, 409, status === 'scheduled' ? 'This assessment has not opened yet' : 'This assessment is closed', { code: 'NOT_OPEN' });

  const mine = await assessmentRepo.listSessions(institutionId, { assessmentId: a._id, userId: req.user.id });
  const live = mine.find((s) => s.status === 'active' && !sessionWriteBlock(s, now));
  if (live) {
    const titles = await questionTitles(institutionId, live);
    return res.json({ success: true, resumed: true, session: sessionStudentView(live, a, titles, now) });
  }
  if (mine.length >= a.attemptsAllowed) return fail(res, 409, 'You have no attempts left for this assessment', { code: 'NO_ATTEMPTS_LEFT' });

  // Resolve variants (deterministic per student and assessment), then this student's order.
  const used = new Set();
  const slots = [];
  for (const baseId of a.questionIds) {
    const base = await questionRepo.findVisible(institutionId, baseId);
    if (!base) return fail(res, 409, 'A question in this assessment is no longer available. Tell your lecturer.', { code: 'QUESTION_MISSING' });
    let chosen = base;
    if (base.variantGroup) {
      const members = (await questionRepo.listVariantGroup(institutionId, base.variantGroup))
        .filter((m) => m.type === base.type && !used.has(sid(m._id)));
      if (members.length && members.some((m) => sid(m._id) === sid(base._id))) chosen = pickVariant(members, req.user.id, a._id, base.variantGroup);
    }
    used.add(sid(chosen._id));
    slots.push({ baseQuestionId: base._id, resolvedQuestionId: chosen._id });
  }
  const ordered = orderSlots(slots, req.user.id, a._id, a.shuffleQuestions !== false);
  const acc = accommodationFor(a, req.user.id);
  const baseDeadline = computeBaseDeadline({ startedAt: now, durationMinutes: a.durationMinutes, extraTimePercent: acc.extraTimePercent || 0, closesAt: a.closesAt });
  const session = await assessmentRepo.createSession({
    institutionId, assessmentId: a._id, courseId: a.courseId, userId: req.user.id, attemptNo: mine.length + 1, serverStartedAt: now, baseDeadline,
    closesAt: a.closesAt, extraTimePercent: acc.extraTimePercent || 0, disabledSignals: acc.disabledSignals || [], integrityLevel: a.integrityLevel,
    questions: ordered.map((o) => ({ slot: o.slot, questionId: o.resolvedQuestionId, baseQuestionId: o.baseQuestionId })),
  });
  await audit({ actor: req.user.id, action: 'assessment.start', target: session._id, institutionId, meta: { assessmentId: sid(a._id) } });
  const titles = await questionTitles(institutionId, session);
  res.status(201).json({ success: true, resumed: false, session: sessionStudentView(session, a, titles, now) });
};

// Loads the student's own session and its assessment, or sends 404.
const loadMine = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.sessionId)) { fail(res, 404, 'Session not found'); return null; }
  const session = await assessmentRepo.findSession(institutionId, req.params.sessionId);
  if (!session || sid(session.userId) !== sid(req.user.id)) { fail(res, 404, 'Session not found'); return null; }
  const assessment = await assessmentRepo.findAssessment(institutionId, session.assessmentId);
  if (!assessment) { fail(res, 404, 'Session not found'); return null; }
  return { institutionId, session, assessment };
};

// The timer. Returns true (and has sent the error) when the session may not be written to.
const blockedByTimer = (res, { session, assessment }) => {
  const now = new Date();
  if (assessment.status === 'closed') { fail(res, 409, 'This assessment was closed by your lecturer.', { code: 'ASSESSMENT_CLOSED' }); return true; }
  const block = sessionWriteBlock(session, now);
  if (block) { fail(res, 409, block.message, { code: block.code, deadline: sessionDeadline(session), serverNow: now }); return true; }
  return false;
};

// Loads the session, applies the timer, and finds the question inside the session. Sends the error and returns null on failure.
const loadWritable = async (req, res) => {
  const ctx = await loadMine(req, res);
  if (!ctx) return null;
  if (blockedByTimer(res, ctx)) return null;
  const q = await loadSessionQuestion(req, res, ctx);
  return q ? { ...ctx, question: q } : null;
};

const loadSessionQuestion = async (req, res, ctx) => {
  const inSession = isId(req.params.questionId) && (ctx.session.questions || []).some((x) => sid(x.questionId) === sid(req.params.questionId));
  const q = inSession ? await questionRepo.findVisible(ctx.institutionId, req.params.questionId, { staff: true }) : null;
  if (!q) { fail(res, 404, 'Question not found in this assessment'); return null; }
  return q;
};

export const getSession = async (req, res) => {
  const ctx = await loadMine(req, res);
  if (!ctx) return;
  const titles = await questionTitles(ctx.institutionId, ctx.session);
  res.json({ success: true, session: sessionStudentView(ctx.session, ctx.assessment, titles) });
};

// Reading a question is allowed while the session is active (and within the grace period); never hints or explanations.
export const getSessionQuestion = async (req, res) => {
  const ctx = await loadMine(req, res);
  if (!ctx) return;
  if (blockedByTimer(res, ctx)) return;
  const q = await loadSessionQuestion(req, res, ctx);
  if (!q) return;
  const tests = CODE_TYPES.includes(q.type) ? await questionRepo.listTests(q._id) : [];
  const { learningOutcome, estimatedMinutes, ...view } = studentQuestion(q, tests);
  const draft = await assessmentRepo.findSessionDraft(ctx.institutionId, ctx.session._id, q._id);
  res.json({
    success: true,
    question: view,
    draft: draft ? { attemptId: sid(draft._id), language: draft.language || null, source: draft.source || '', updatedAt: draft.updatedAt || null } : null,
    deadline: sessionDeadline(ctx.session), serverNow: new Date(),
  });
};

const attemptExtra = (session) => ({ assessmentSessionId: session._id });

export const runInSession = async (req, res) => {
  const c = await loadWritable(req, res);
  if (!c) return;
  send(res, await runForQuestion(c.question, req.body, { institutionId: c.institutionId, userId: req.user.id, attemptExtra: attemptExtra(c.session) }));
};

export const submitInSession = async (req, res) => {
  const c = await loadWritable(req, res);
  if (!c) return;
  const result = await submitForQuestion(c.question, req.body, { institutionId: c.institutionId, userId: req.user.id, attemptExtra: attemptExtra(c.session) });
  if (result.status !== 200) return send(res, result);
  const b = result.body;
  if (!c.assessment.releaseResults) {
    // Assessment mode: the answer is stored and marked server-side, but the student sees no verdict, score, tests or explanation.
    return res.json({ success: true, attemptId: b.attemptId, submitted: true, message: 'Answer recorded. Results are released by your lecturer.' });
  }
  const { explanation, ...visible } = b;
  return res.json(visible);
};

const ensureDraft = async (c) => {
  let draft = await assessmentRepo.findSessionDraft(c.institutionId, c.session._id, c.question._id);
  if (!draft) {
    draft = await questionRepo.createAttempt({
      userId: c.session.userId, institutionId: c.institutionId, questionId: c.question._id, questionVersion: c.question.version, runKind: 'draft',
      language: c.question.languages?.[0] || null, source: '', assessmentSessionId: c.session._id,
    });
  }
  return draft;
};

export const autosaveInSession = async (req, res) => {
  const c = await loadWritable(req, res);
  if (!c) return;
  const { language, source } = req.body || {};
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) return fail(res, 400, 'source must be a string of at most 64 KB');
  const lang = normalizeLanguage(language);
  if (!lang) return fail(res, 400, 'Unsupported language');
  const draft = await ensureDraft(c);
  const updated = await questionRepo.updateAttempt(c.institutionId, req.user.id, draft._id, { language: lang, source });
  res.json({ success: true, draft: { attemptId: sid(updated._id), questionId: sid(updated.questionId), language: updated.language, source: updated.source, updatedAt: updated.updatedAt || null } });
};

export const eventsInSession = async (req, res) => {
  const c = await loadWritable(req, res);
  if (!c) return;
  const cleaned = cleanEvents(req.body?.events);
  if (cleaned.error) return send(res, cleaned.error);
  const draft = await ensureDraft(c);
  if (await questionRepo.countEventBatches(c.institutionId, draft._id) >= EVENT_LIMITS.maxBatchesPerAttempt) return fail(res, 429, 'Too many event batches for this question');
  await questionRepo.addEventBatch({
    attemptId: draft._id, assessmentSessionId: c.session._id, questionId: c.question._id, userId: req.user.id, institutionId: c.institutionId,
    seq: Number.isInteger(req.body?.seq) ? req.body.seq : 0, events: cleaned.clean,
  });
  res.status(201).json({ success: true, stored: cleaned.clean.length });
};

export const finishSession = async (req, res) => {
  const ctx = await loadMine(req, res);
  if (!ctx) return;
  let session = ctx.session;
  if (session.status === 'active') {
    session = await assessmentRepo.updateSession(ctx.institutionId, session._id, { status: 'submitted', submittedAt: new Date() });
    await audit({ actor: req.user.id, action: 'assessment.finish', target: session._id, institutionId: ctx.institutionId, meta: { assessmentId: sid(ctx.assessment._id) } });
    await onSessionFinished(ctx.institutionId, session._id); // never throws; flagging must not stop a student from finishing
  }
  res.json({ success: true, session: { id: sid(session._id), status: session.status, submittedAt: session.submittedAt } });
};

// Results are only visible once the lecturer sets releaseResults, and only after the student's session has ended.
export const sessionResults = async (req, res) => {
  const ctx = await loadMine(req, res);
  if (!ctx) return;
  const { session, assessment, institutionId } = ctx;
  const ended = session.status === 'submitted' || remainingSeconds(session) === 0;
  if (!assessment.releaseResults || !ended) return fail(res, 403, 'Results have not been released yet', { code: 'RESULTS_NOT_RELEASED' });
  const attempts = await assessmentRepo.listAttemptsForSessions(institutionId, [session._id], { runKind: 'submit' });
  const titles = await questionTitles(institutionId, session);
  res.json({
    success: true,
    results: (session.questions || []).map((q, index) => {
      const last = attempts.filter((x) => sid(x.questionId) === sid(q.questionId)).pop();
      return {
        index, questionId: sid(q.questionId), title: titles[sid(q.questionId)]?.title || '', answered: !!last,
        verdict: last?.verdict || null, score: last ? last.score : null, pendingReview: !!last?.needsReview,
      };
    }),
  });
};
