// Runs the flagging rules for one session and keeps its ReviewCase up to date. Never touches marks.
import assessmentRepo from '../../repositories/assessmentRepo.js';
import { deriveFlags } from './flagging.js';
import { effectiveThresholds } from './thresholds.js';
import { sessionDeadline } from '../assessments/rules.js';

const sid = (v) => String(v);

export const analyseSession = async (institutionId, sessionId, { now = new Date() } = {}) => {
  const session = await assessmentRepo.findSession(institutionId, sessionId);
  if (!session) return null;
  const assessment = await assessmentRepo.findAssessment(institutionId, session.assessmentId);
  if (!assessment) return null;
  const [events, batches, pairs, existing] = await Promise.all([
    assessmentRepo.listIntegrityEvents(institutionId, session._id),
    assessmentRepo.listBatchesForSession(institutionId, session._id),
    assessmentRepo.listSimilarity(institutionId, { sessionId: session._id, flaggedOnly: true }),
    assessmentRepo.findCaseBySession(institutionId, session._id),
  ]);
  const start = new Date(session.serverStartedAt).getTime();
  const endAt = session.submittedAt ? new Date(session.submittedAt) : new Date(Math.min(sessionDeadline(session).getTime(), new Date(now).getTime()));
  const similarity = pairs.map((p) => {
    const mineIsA = sid(p.sessionAId) === sid(session._id);
    return {
      id: p._id, flagged: p.flagged, questionId: p.questionId, containment: p.containment, threshold: p.threshold,
      otherUserId: mineIsA ? p.userBId : p.userAId, otherSessionId: mineIsA ? p.sessionBId : p.sessionAId,
    };
  });
  const { reasons, technical } = deriveFlags({
    events, batches, similarity, thresholds: effectiveThresholds(assessment), sessionStartMs: start, sessionEndMs: endAt.getTime() - start,
  });

  if (!existing) {
    if (!reasons.length) return { case: null, reasons, technical };
    const created = await assessmentRepo.createCase({
      institutionId, assessmentId: assessment._id, courseId: assessment.courseId, sessionId: session._id, userId: session.userId,
      status: 'open', reasons, technical, history: [{ at: new Date(), by: 'system', action: 'created', from: null, to: 'open' }],
    });
    return { case: created, reasons, technical, created: true };
  }
  const changed = JSON.stringify(existing.reasons.map((r) => r.text)) !== JSON.stringify(reasons.map((r) => r.text));
  const updated = await assessmentRepo.updateCase(institutionId, existing._id, {
    $set: { reasons, technical },
    ...(changed ? { $push: { history: { at: new Date(), by: 'system', action: 'reasons_updated', from: existing.status, to: existing.status } } } : {}),
  });
  return { case: updated, reasons, technical, created: false };
};
