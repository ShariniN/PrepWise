// While a student has an assessment that has not closed, the questions in it are off limits in practice mode
// (otherwise practice would be a way around the timer and the "no hints" rule).
import assessmentRepo from '../../repositories/assessmentRepo.js';
import questionRepo from '../../repositories/questionRepo.js';
import { institutionOf } from '../../middleware/tenancy.js';

const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));

export const lockedQuestionIds = async (req) => {
  const sessions = await assessmentRepo.findLockingSessions(institutionOf(req), req.user.id, new Date());
  const set = new Set();
  for (const s of sessions) for (const q of s.questions || []) { set.add(String(q.questionId)); if (q.baseQuestionId) set.add(String(q.baseQuestionId)); }
  return set;
};

const blocked = (res) => res.status(409).json({
  success: false, code: 'ASSESSMENT_IN_PROGRESS',
  message: 'This question is part of an assessment that has not closed yet. Open it from the assessment instead.',
});

// Router middleware for /questions/:id/... routes.
export const blockLockedQuestion = async (req, res, next) => {
  if (!isId(req.params.id)) return next();
  if ((await lockedQuestionIds(req)).has(String(req.params.id))) return blocked(res);
  return next();
};

// Router middleware for /attempts/:id/... routes (looks up the attempt's question).
export const blockLockedAttempt = async (req, res, next) => {
  if (!isId(req.params.id)) return next();
  const attempt = await questionRepo.findAttempt(institutionOf(req), req.user.id, req.params.id);
  if (attempt && (await lockedQuestionIds(req)).has(String(attempt.questionId))) return blocked(res);
  return next();
};
