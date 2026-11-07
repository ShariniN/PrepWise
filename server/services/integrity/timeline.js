// One ordered view of a session: integrity events, editing activity (one entry per stored edit batch) and
// run / submit attempts, all positioned in ms since the session started.
import assessmentRepo from '../../repositories/assessmentRepo.js';
import { sessionDeadline } from '../assessments/rules.js';

export const TIMELINE_LIMIT = 3000;
const idOf = (d) => String(d._id);

export const mergeTimeline = ({ session, events = [], batches = [], attempts = [] }) => {
  const start = new Date(session.serverStartedAt).getTime();
  const items = [{ at: 0, kind: 'session', type: 'started' }];

  for (const e of events) {
    items.push({
      at: e.t, kind: 'integrity', type: e.type, technical: !!e.technical, questionId: e.questionId ? String(e.questionId) : null,
      ...(e.len != null ? { len: e.len } : {}), ...(e.inEditor != null ? { inEditor: e.inEditor } : {}), ...(e.detail ? { detail: e.detail } : {}),
      ref: { kind: 'integrity_event', id: idOf(e) },
    });
  }

  for (const b of batches) {
    const list = b.events || [];
    if (!list.length) continue;
    const ts = list.map((x) => x.t);
    const lastT = Math.max(...ts);
    const end = new Date(b.createdAt).getTime() - start;
    const sum = (type) => list.filter((x) => x.type === type).reduce((n, x) => n + (x.len || 0), 0);
    items.push({
      at: end - (lastT - Math.min(...ts)), until: end, kind: 'editing', questionId: String(b.questionId), events: list.length,
      inserted: sum('insert'), deleted: sum('delete'), pasted: sum('paste'), pasteCount: list.filter((x) => x.type === 'paste').length,
      ref: { kind: 'edit_batch', id: idOf(b) },
    });
  }

  for (const a of attempts) {
    if (a.runKind === 'draft') continue;
    items.push({
      at: new Date(a.createdAt).getTime() - start, kind: 'attempt', type: a.runKind, questionId: String(a.questionId),
      verdict: a.verdict || null, language: a.language || null, ref: { kind: 'attempt', id: idOf(a) },
    });
  }

  if (session.submittedAt) items.push({ at: new Date(session.submittedAt).getTime() - start, kind: 'session', type: 'submitted' });
  items.push({ at: sessionDeadline(session).getTime() - start, kind: 'session', type: 'deadline' });

  items.sort((a, b) => a.at - b.at);
  const truncated = items.length > TIMELINE_LIMIT;
  return { startedAt: session.serverStartedAt, items: truncated ? items.slice(0, TIMELINE_LIMIT) : items, truncated };
};

export const buildTimeline = async (sessionId, institutionId) => {
  const session = await assessmentRepo.findSession(institutionId, sessionId);
  if (!session) return null;
  const [events, batches, attempts] = await Promise.all([
    assessmentRepo.listIntegrityEvents(institutionId, session._id),
    assessmentRepo.listBatchesForSession(institutionId, session._id),
    assessmentRepo.listAttemptsForSessions(institutionId, [session._id]),
  ]);
  return { session, ...mergeTimeline({ session, events, batches, attempts }) };
};
