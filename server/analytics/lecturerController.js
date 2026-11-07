import analyticsRepo from './repo.js';
import { resolveLecturerScope, intParam } from './access.js';
import * as agg from './aggregate.js';

const scopeInfo = (s) => ({
  courseId: String(s.course._id), courseCode: s.course.code, cohortId: s.cohort ? String(s.cohort._id) : null,
  cohortName: s.cohort?.name || null, students: s.students.length,
});

// Loads scoped attempts plus the questions they touch.
const load = async (s, opts = {}) => {
  const ids = s.students.map((u) => String(u._id));
  const attempts = await analyticsRepo.attemptsForStudents(s.institutionId, ids, opts);
  const qids = [...new Set(attempts.map((a) => String(a.questionId)))];
  const questions = await analyticsRepo.questionsByIds(s.institutionId, qids);
  return { ids, attempts, questions };
};

export const failurePatterns = async (req, res) => {
  const s = await resolveLecturerScope(req, res);
  if (!s) return;
  const { ids, attempts, questions } = await load(s, { kinds: ['submit'] });
  const coding = questions.filter((q) => ['coding', 'debug'].includes(q.type));
  const tests = await analyticsRepo.testsByQuestion(coding.map((q) => String(q._id)));
  const out = agg.failurePatterns({ questions: coding, tests, attempts, scopeStudentIds: ids });
  res.json({
    success: true, scope: scopeInfo(s), minimumStudents: agg.MIN_N, ...out,
    note: 'Failure percentages use each student latest submission. Questions with fewer than 5 students return a notice instead of percentages. Hidden test data is for staff only.',
  });
};

export const topicHeatmap = async (req, res) => {
  const s = await resolveLecturerScope(req, res);
  if (!s) return;
  const { attempts, questions } = await load(s, { kinds: ['submit'] });
  res.json({ success: true, scope: scopeInfo(s), ...agg.topicHeatmap({ students: s.students, questions, attempts }) });
};

export const studentsNeedingHelp = async (req, res) => {
  const s = await resolveLecturerScope(req, res);
  if (!s) return;
  const q = req.query;
  const opts = {
    inactiveDays: intParam(q.inactiveDays, agg.HELP_DEFAULTS.inactiveDays, 1, 365),
    declineWindow: intParam(q.declineWindow, agg.HELP_DEFAULTS.declineWindow, 2, 10),
    declineMin: intParam(q.declineMin, agg.HELP_DEFAULTS.declineMin, 1, 100),
    compileErrors: intParam(q.compileErrors, agg.HELP_DEFAULTS.compileErrors, 1, 20),
    compileWindow: intParam(q.compileWindow, agg.HELP_DEFAULTS.compileWindow, 1, 50),
  };
  const { attempts, questions } = await load(s);
  res.json({
    success: true, scope: scopeInfo(s),
    ...agg.studentsNeedingHelp({ students: s.students, questions, attempts, now: new Date(), opts }),
    note: 'Students are listed alphabetically with the reasons they matched. There is deliberately no risk score or ranking.',
  });
};

export const questionQuality = async (req, res) => {
  const s = await resolveLecturerScope(req, res);
  if (!s) return;
  const { attempts, questions } = await load(s);
  const overExposurePct = intParam(req.query.overExposurePct, 90, 1, 100);
  res.json({ success: true, scope: scopeInfo(s), minimumStudents: agg.MIN_N, ...agg.questionQuality({ students: s.students, questions, attempts, overExposurePct }) });
};

export const activity = async (req, res) => {
  const s = await resolveLecturerScope(req, res);
  if (!s) return;
  const days = intParam(req.query.days, 30, 1, 180);
  const now = new Date();
  const since = new Date(now.getTime() - days * agg.DAY_MS);
  const ids = s.students.map((u) => String(u._id));
  const attempts = await analyticsRepo.attemptsForStudents(s.institutionId, ids, { since, kinds: ['run', 'submit'] });
  res.json({ success: true, scope: scopeInfo(s), days, daily: agg.activityByDay({ attempts, studentIds: ids, now, days }) });
};
