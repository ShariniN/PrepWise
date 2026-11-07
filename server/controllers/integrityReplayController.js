// GET /api/integrity/sessions/:id/replay?questionId=  (staff, audited)
import assessmentRepo from '../repositories/assessmentRepo.js';
import questionRepo from '../repositories/questionRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { isId, loadStaffCourse } from '../services/courseAccess.js';
import { reconstructReplay, REPLAY_LIMITS } from '../services/integrity/replay.js';

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const sid = (v) => String(v);
const toPlain = (m) => (m instanceof Map ? Object.fromEntries(m) : (m || {}));

export const getReplay = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.id)) return fail(res, 404, 'Session not found');
  const session = await assessmentRepo.findSession(institutionId, req.params.id);
  if (!session || !(await loadStaffCourse(req, session.courseId))) return fail(res, 404, 'Session not found');
  const questionId = req.query.questionId;
  if (!isId(questionId) || !(session.questions || []).some((q) => sid(q.questionId) === sid(questionId))) return fail(res, 404, 'Question not found in this session');

  const [batches, attempts, question] = await Promise.all([
    assessmentRepo.listBatchesForSession(institutionId, session._id, questionId),
    assessmentRepo.listAttemptsForSessions(institutionId, [session._id]),
    questionRepo.findVisible(institutionId, questionId),
  ]);
  // The document the student ended with: the newest draft save or submission for this question.
  const mine = attempts.filter((a) => sid(a.questionId) === sid(questionId) && a.runKind !== 'run' && typeof a.source === 'string');
  const stamp = (a) => new Date(a.updatedAt || a.createdAt).getTime();
  const finalAttempt = mine.sort((a, b) => stamp(b) - stamp(a))[0] || null;
  const language = finalAttempt?.language || null;
  const finalText = finalAttempt ? finalAttempt.source : null;
  const starter = language ? toPlain(question?.starterCode)[language] || '' : '';

  // The editor usually opens with the starter code already in it, and no event describes that. Try the starter
  // first, then an empty document, and keep whichever reproduces the final text.
  const candidates = starter ? [['starter', starter], ['empty', '']] : [['empty', '']];
  let best = null;
  for (const [label, initialText] of candidates) {
    const r = reconstructReplay(batches, { initialText, finalText });
    if (!best || (r.matchesFinal && !best.result.matchesFinal)) best = { label, result: r };
    if (r.matchesFinal) break;
  }
  const { result } = best;
  await audit({
    actor: req.user.id, action: 'integrity.replay', target: session._id, institutionId,
    meta: { assessmentId: sid(session.assessmentId), questionId: sid(questionId), studentId: sid(session.userId), states: result.states.length },
  });
  res.json({
    success: true, sessionId: sid(session._id), questionId: sid(questionId), language, initialSource: best.label,
    matchesFinal: result.matchesFinal, approximate: result.approximate, truncated: result.truncated, totalEvents: result.totalEvents,
    durationMs: result.durationMs, states: result.states, limits: REPLAY_LIMITS,
    note: batches.length ? undefined : 'No edit events were recorded for this question.',
  });
};
