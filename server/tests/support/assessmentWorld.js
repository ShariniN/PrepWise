// In-memory stand-in for assessmentRepo (and questionRepo.listVariantGroup). Honours the same tenancy rules as the
// real repository: every read and write matches the caller's institution. Attempts and edit-event batches live in
// the question world (world.qdb), which installQuestionWorld creates first.
import { mock } from 'node:test';
import assessmentRepo from '../../repositories/assessmentRepo.js';
import questionRepo from '../../repositories/questionRepo.js';
import { newId } from '../helpers.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const clone = (o) => (o == null ? o : structuredClone(o));

export const installAssessmentWorld = (world) => {
  const db = { assessments: [], sessions: [], events: [], cases: [], pairs: [], institutions: world.institutions };
  world.adb = db;
  const inst = (d, i) => same(d.institutionId, i);
  const apply = (doc, patch) => {
    if (!patch.$set && !patch.$inc && !patch.$push) { Object.assign(doc, clone(patch)); return; }
    Object.assign(doc, clone(patch.$set || {}));
    for (const [k, v] of Object.entries(patch.$inc || {})) doc[k] = (doc[k] || 0) + v;
    for (const [k, v] of Object.entries(patch.$push || {})) doc[k] = [...(doc[k] || []), clone(v)];
  };
  const stamp = (d) => Object.assign(d, { updatedAt: new Date() });

  mock.method(questionRepo, 'listVariantGroup', async (i, group) => (world.qdb?.questions || [])
    .filter((q) => (q.institutionId == null || same(q.institutionId, i)) && q.variantGroup === group && q.status === 'published').map(clone));

  mock.method(assessmentRepo, 'createAssessment', async (doc) => {
    const d = { _id: newId(), status: 'draft', accommodations: [], flagThresholds: {}, createdAt: new Date(), updatedAt: new Date(), ...clone(doc) };
    db.assessments.push(d);
    return clone(d);
  });
  mock.method(assessmentRepo, 'findAssessment', async (i, id) => clone(db.assessments.find((a) => same(a._id, id) && inst(a, i))) || null);
  mock.method(assessmentRepo, 'listAssessments', async (i, { courseIds, notDraft } = {}) => db.assessments
    .filter((a) => inst(a, i) && (!courseIds || courseIds.some((c) => same(c, a.courseId))) && (!notDraft || a.status !== 'draft')).map(clone));
  mock.method(assessmentRepo, 'updateAssessment', async (i, id, patch) => {
    const a = db.assessments.find((x) => same(x._id, id) && inst(x, i));
    if (!a) return null;
    Object.assign(a, clone(patch));
    stamp(a);
    return clone(a);
  });

  mock.method(assessmentRepo, 'createSession', async (doc) => {
    const d = { _id: newId(), status: 'active', extensionMs: 0, extensions: [], submittedAt: null, createdAt: new Date(), updatedAt: new Date(), ...clone(doc) };
    db.sessions.push(d);
    return clone(d);
  });
  mock.method(assessmentRepo, 'findSession', async (i, id) => clone(db.sessions.find((s) => same(s._id, id) && inst(s, i))) || null);
  mock.method(assessmentRepo, 'listSessions', async (i, { assessmentId, assessmentIds, userId } = {}) => db.sessions
    .filter((s) => inst(s, i) && (!assessmentId || same(s.assessmentId, assessmentId))
      && (!assessmentIds || assessmentIds.some((a) => same(a, s.assessmentId))) && (!userId || same(s.userId, userId))).map(clone));
  mock.method(assessmentRepo, 'updateSession', async (i, id, patch) => {
    const s = db.sessions.find((x) => same(x._id, id) && inst(x, i));
    if (!s) return null;
    apply(s, patch);
    stamp(s);
    return clone(s);
  });
  mock.method(assessmentRepo, 'findLockingSessions', async (i, userId, now) => db.sessions
    .filter((s) => inst(s, i) && same(s.userId, userId) && new Date(s.closesAt) > new Date(now)).map(clone));
  mock.method(assessmentRepo, 'closeSessionWindows', async (i, assessmentId, now) => {
    for (const s of db.sessions.filter((x) => inst(x, i) && same(x.assessmentId, assessmentId))) s.closesAt = now;
  });

  const attempts = () => world.qdb.attempts;
  mock.method(assessmentRepo, 'findSessionDraft', async (i, sid, qid) => clone(attempts()
    .find((a) => a.runKind === 'draft' && inst(a, i) && same(a.assessmentSessionId, sid) && same(a.questionId, qid))) || null);
  mock.method(assessmentRepo, 'listAttemptsForSessions', async (i, sids, { runKind } = {}) => attempts()
    .filter((a) => inst(a, i) && sids.some((s) => same(s, a.assessmentSessionId)) && (!runKind || a.runKind === runKind)).map(clone));
  mock.method(assessmentRepo, 'listBatchesForSession', async (i, sid, qid) => world.qdb.batches
    .filter((b) => inst(b, i) && same(b.assessmentSessionId, sid) && (!qid || same(b.questionId, qid)))
    .sort((a, b) => (a.seq - b.seq) || (new Date(a.createdAt) - new Date(b.createdAt))).map(clone));

  mock.method(assessmentRepo, 'addIntegrityEvents', async (docs) => {
    for (const d of docs) db.events.push({ _id: newId(), createdAt: new Date(), receivedAt: new Date(), ...clone(d) });
  });
  mock.method(assessmentRepo, 'countIntegrityEvents', async (i, sid) => db.events.filter((e) => inst(e, i) && same(e.sessionId, sid)).length);
  mock.method(assessmentRepo, 'listIntegrityEvents', async (i, sid) => db.events
    .filter((e) => inst(e, i) && same(e.sessionId, sid)).sort((a, b) => a.t - b.t).map(clone));

  mock.method(assessmentRepo, 'findCase', async (i, id) => clone(db.cases.find((c) => same(c._id, id) && inst(c, i))) || null);
  mock.method(assessmentRepo, 'findCaseBySession', async (i, sid) => clone(db.cases.find((c) => same(c.sessionId, sid) && inst(c, i))) || null);
  mock.method(assessmentRepo, 'createCase', async (doc) => {
    const d = { _id: newId(), status: 'open', history: [], notes: '', outcome: null, studentResponse: null, createdAt: new Date(), updatedAt: new Date(), ...clone(doc) };
    db.cases.push(d);
    return clone(d);
  });
  mock.method(assessmentRepo, 'updateCase', async (i, id, patch) => {
    const c = db.cases.find((x) => same(x._id, id) && inst(x, i));
    if (!c) return null;
    apply(c, patch);
    stamp(c);
    return clone(c);
  });
  mock.method(assessmentRepo, 'listCases', async (i, { courseIds, status, assessmentId, userId } = {}) => db.cases
    .filter((c) => inst(c, i) && (!courseIds || courseIds.some((x) => same(x, c.courseId)))
      && (!status || (Array.isArray(status) ? status : [status]).includes(c.status))
      && (!assessmentId || same(c.assessmentId, assessmentId)) && (!userId || same(c.userId, userId))).map(clone));

  mock.method(assessmentRepo, 'replaceSimilarity', async (i, assessmentId, pairs) => {
    db.pairs = db.pairs.filter((p) => !(inst(p, i) && same(p.assessmentId, assessmentId)));
    for (const p of pairs) db.pairs.push({ _id: newId(), createdAt: new Date(), ...clone(p), institutionId: i, assessmentId });
  });
  mock.method(assessmentRepo, 'listSimilarity', async (i, { assessmentId, sessionId, flaggedOnly } = {}) => db.pairs
    .filter((p) => inst(p, i) && (!assessmentId || same(p.assessmentId, assessmentId))
      && (!sessionId || same(p.sessionAId, sessionId) || same(p.sessionBId, sessionId)) && (!flaggedOnly || p.flagged)).map(clone));

  mock.method(assessmentRepo, 'listRetentionPolicies', async () => Object.values(db.institutions).map((x) => ({ _id: x._id, retentionDays: x.retentionDays ?? 90 })));
  mock.method(assessmentRepo, 'protectedSessionIds', async (i) => db.cases.filter((c) => inst(c, i) && ['open', 'escalated'].includes(c.status)).map((c) => c.sessionId));
  mock.method(assessmentRepo, 'deleteExpiredEvidence', async (i, cutoff, protectedIds) => {
    const keep = (sid) => protectedIds.some((p) => same(p, sid));
    const old = (d) => inst(d, i) && new Date(d.createdAt) < cutoff;
    const nE = db.events.length; db.events = db.events.filter((e) => !(old(e) && !keep(e.sessionId)));
    const nB = world.qdb.batches.length;
    world.qdb.batches = world.qdb.batches.filter((b) => !(old(b) && b.assessmentSessionId && !keep(b.assessmentSessionId)));
    const nP = db.pairs.length; db.pairs = db.pairs.filter((p) => !(old(p) && !keep(p.sessionAId) && !keep(p.sessionBId)));
    return { integrityEvents: nE - db.events.length, editEventBatches: nB - world.qdb.batches.length, similarityPairs: nP - db.pairs.length };
  });
  mock.method(assessmentRepo, 'deleteExpiredCases', async (i, cutoff) => {
    const n = db.cases.length;
    db.cases = db.cases.filter((c) => !(inst(c, i) && ['dismissed', 'resolved'].includes(c.status) && new Date(c.updatedAt) < cutoff));
    return n - db.cases.length;
  });

  // seeding helpers
  db.addAssessment = (fields) => {
    const now = Date.now();
    const d = {
      _id: newId(), status: 'scheduled', title: 'Midterm', questionIds: [], opensAt: new Date(now - 3600e3), closesAt: new Date(now + 3600e3),
      durationMinutes: 60, attemptsAllowed: 1, integrityLevel: 1, shuffleQuestions: true, releaseResults: false, accommodations: [], flagThresholds: {},
      createdAt: new Date(), updatedAt: new Date(), ...fields,
    };
    db.assessments.push(d);
    return d;
  };
  return db;
};
