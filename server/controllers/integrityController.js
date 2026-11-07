// Integrity (Level 1: browser signals only, no camera or audio) and the staff review queue.
import assessmentRepo from '../repositories/assessmentRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { isId } from '../services/courseAccess.js';
import { INTEGRITY_SIGNALS } from '../models/Assessment.js';
import { sessionDeadline, EVENT_GRACE_MS } from '../services/assessments/rules.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const sid = (v) => String(v);

export const EVENT_BATCH_LIMITS = { maxEvents: 100, maxBytes: 16 * 1024, maxPerSession: 5000, maxPasteLen: 10_000_000 };
const TECHNICAL = new Set(['network_offline', 'network_online']);

// POST /api/assessments/sessions/:sessionId/integrity-events (student)
export const postIntegrityEvents = async (req, res) => {
  const institutionId = institutionOf(req);
  if (!isId(req.params.sessionId)) return fail(res, 404, 'Session not found');
  const session = await assessmentRepo.findSession(institutionId, req.params.sessionId);
  if (!session || sid(session.userId) !== sid(req.user.id)) return fail(res, 404, 'Session not found');
  const { events } = req.body || {};
  if (!Array.isArray(events) || !events.length) return fail(res, 400, 'events must be a non-empty array');
  if (events.length > EVENT_BATCH_LIMITS.maxEvents) return fail(res, 413, `At most ${EVENT_BATCH_LIMITS.maxEvents} events per batch`);
  if (JSON.stringify(events).length > EVENT_BATCH_LIMITS.maxBytes) return fail(res, 413, 'Event batch is too large');
  if (session.integrityLevel < 1) return res.status(200).json({ success: true, stored: 0, ignored: events.length, message: 'Integrity monitoring is off for this assessment' });
  // Events are accepted a few minutes past the deadline so the last page-hide / reconnect signals are not lost.
  if (Date.now() > sessionDeadline(session).getTime() + EVENT_GRACE_MS) return fail(res, 409, 'This session has ended', { code: 'SESSION_ENDED' });

  const inSession = new Set((session.questions || []).map((q) => sid(q.questionId)));
  const clean = [];
  let ignored = 0;
  for (const e of events) {
    if (!e || typeof e !== 'object' || !INTEGRITY_SIGNALS.includes(e.type)) return fail(res, 400, `Each event needs a type from: ${INTEGRITY_SIGNALS.join(', ')}`);
    if (!Number.isFinite(e.t) || e.t < 0 || e.t > 1e10) return fail(res, 400, 'Each event needs t (ms since the session started)');
    if (e.len !== undefined && (!Number.isFinite(e.len) || e.len < 0 || e.len > EVENT_BATCH_LIMITS.maxPasteLen)) return fail(res, 400, 'len must be a non-negative number');
    if (e.inEditor !== undefined && typeof e.inEditor !== 'boolean') return fail(res, 400, 'inEditor must be true or false');
    if (e.questionId !== undefined && e.questionId !== null && !(isId(e.questionId) && inSession.has(sid(e.questionId)))) return fail(res, 400, 'questionId is not part of this session');
    if ((session.disabledSignals || []).includes(e.type)) { ignored += 1; continue; } // accommodation: this signal is not collected for this student
    clean.push({
      institutionId, assessmentId: session.assessmentId, sessionId: session._id, userId: session.userId, questionId: e.questionId || null,
      type: e.type, t: Math.trunc(e.t), len: e.len !== undefined ? Math.trunc(e.len) : null, inEditor: e.inEditor ?? null,
      detail: typeof e.detail === 'string' ? e.detail.slice(0, 100) : '', technical: TECHNICAL.has(e.type), receivedAt: new Date(),
    });
  }
  if (await assessmentRepo.countIntegrityEvents(institutionId, session._id) + clean.length > EVENT_BATCH_LIMITS.maxPerSession) return fail(res, 429, 'Too many integrity events for this session');
  if (clean.length) await assessmentRepo.addIntegrityEvents(clean);
  res.status(201).json({ success: true, stored: clean.length, ignored });
};
