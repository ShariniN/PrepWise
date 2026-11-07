// In-memory stand-in for questionRepo. It honours the same tenancy rules as the real repository:
// reads see `institutionId in [null, caller]`, writes match the caller's institution exactly.
import { mock } from 'node:test';
import questionRepo from '../../repositories/questionRepo.js';
import { newId } from '../helpers.js';
import { installAssessmentWorld } from './assessmentWorld.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const clone = (o) => (o == null ? o : structuredClone(o));
const readable = (inst, d) => d.institutionId == null || same(d.institutionId, inst);

export const installQuestionWorld = (world) => {
  const db = { questions: [], tests: [], rubrics: [], attempts: [], batches: [] };
  world.qdb = db;

  const q = (id) => db.questions.find((x) => same(x._id, id));
  mock.method(questionRepo, 'listVisible', async (inst, f = {}) => db.questions
    .filter((d) => readable(inst, d) && (!f.status || d.status === f.status) && (!f.type || d.type === f.type)
      && (!f.topic || d.topic?.includes(f.topic)) && (!f.difficulty || d.difficulty === f.difficulty)
      && (!f.authorId || same(d.authorId, f.authorId)) && !(f.excludeIds || []).some((i) => same(i, d._id))).map(clone));
  mock.method(questionRepo, 'findVisible', async (inst, id) => {
    const d = q(id);
    return d && readable(inst, d) ? clone(d) : null;
  });
  mock.method(questionRepo, 'findOwn', async (inst, id) => {
    const d = q(id);
    return d && same(d.institutionId, inst) ? clone(d) : null;
  });
  mock.method(questionRepo, 'createQuestion', async (doc) => {
    const d = { _id: newId(), version: 1, status: 'draft', createdAt: new Date(), updatedAt: new Date(), institutionId: null, ...clone(doc) };
    db.questions.push(d);
    return clone(d);
  });
  mock.method(questionRepo, 'updateQuestion', async (inst, id, patch) => {
    const d = q(id);
    if (!d || !same(d.institutionId, inst) || d.institutionId == null) return null;
    Object.assign(d, clone(patch), { updatedAt: new Date() });
    return clone(d);
  });
  mock.method(questionRepo, 'deleteQuestion', async (inst, id) => {
    const i = db.questions.findIndex((d) => same(d._id, id) && same(d.institutionId, inst) && d.institutionId != null);
    if (i < 0) return false;
    db.questions.splice(i, 1);
    return true;
  });

  mock.method(questionRepo, 'listTests', async (qid) => db.tests.filter((t) => same(t.questionId, qid)).sort((a, b) => a.order - b.order).map(clone));
  mock.method(questionRepo, 'addTest', async (doc) => { const t = { _id: newId(), ...clone(doc) }; db.tests.push(t); return clone(t); });
  mock.method(questionRepo, 'updateTest', async (inst, qid, tid, patch) => {
    const t = db.tests.find((x) => same(x._id, tid) && same(x.questionId, qid) && same(x.institutionId, inst));
    if (!t) return null;
    Object.assign(t, clone(patch));
    return clone(t);
  });
  mock.method(questionRepo, 'deleteTest', async (inst, qid, tid) => {
    const i = db.tests.findIndex((x) => same(x._id, tid) && same(x.questionId, qid) && same(x.institutionId, inst));
    if (i < 0) return false;
    db.tests.splice(i, 1);
    return true;
  });
  mock.method(questionRepo, 'deleteTestsOf', async (inst, qid) => { db.tests = db.tests.filter((t) => !(same(t.questionId, qid) && same(t.institutionId, inst))); });
  mock.method(questionRepo, 'replaceSeedTests', async (qid, tests) => {
    db.tests = db.tests.filter((t) => !(same(t.questionId, qid) && t.institutionId == null));
    tests.forEach((t, order) => db.tests.push({ _id: newId(), ...clone(t), questionId: qid, institutionId: null, order }));
  });
  mock.method(questionRepo, 'upsertSeedBySlug', async (slug, doc) => {
    let d = db.questions.find((x) => x.slug === slug && x.institutionId == null);
    if (!d) { d = { _id: newId(), createdAt: new Date() }; db.questions.push(d); }
    Object.assign(d, clone(doc), { slug, institutionId: null, updatedAt: new Date() });
    return clone(d);
  });

  mock.method(questionRepo, 'getRubric', async (inst, qid) => clone(db.rubrics.find((r) => same(r.questionId, qid) && readable(inst, r))) || null);
  mock.method(questionRepo, 'saveRubric', async (inst, qid, criteria) => {
    let r = db.rubrics.find((x) => same(x.questionId, qid) && same(x.institutionId, inst));
    if (!r) { r = { _id: newId(), questionId: qid, institutionId: inst }; db.rubrics.push(r); }
    r.criteria = clone(criteria);
    return clone(r);
  });
  mock.method(questionRepo, 'deleteRubric', async (inst, qid) => {
    const n = db.rubrics.length;
    db.rubrics = db.rubrics.filter((r) => !(same(r.questionId, qid) && same(r.institutionId, inst)));
    return db.rubrics.length < n;
  });

  mock.method(questionRepo, 'createAttempt', async (doc) => {
    const a = { _id: newId(), createdAt: new Date(), updatedAt: new Date(), ...clone(doc) };
    db.attempts.push(a);
    return clone(a);
  });
  mock.method(questionRepo, 'findAttempt', async (inst, uid, id) =>
    clone(db.attempts.find((a) => same(a._id, id) && same(a.institutionId, inst) && same(a.userId, uid))) || null);
  mock.method(questionRepo, 'updateAttempt', async (inst, uid, id, patch) => {
    const a = db.attempts.find((x) => same(x._id, id) && same(x.institutionId, inst) && same(x.userId, uid));
    if (!a) return null;
    Object.assign(a, clone(patch), { updatedAt: new Date() });
    return clone(a);
  });
  mock.method(questionRepo, 'findDraft', async (inst, uid, qid) =>
    clone(db.attempts.find((a) => a.runKind === 'draft' && same(a.institutionId, inst) && same(a.userId, uid) && same(a.questionId, qid))) || null);
  mock.method(questionRepo, 'solvedQuestionIds', async (inst, uid) => [...new Set(db.attempts
    .filter((a) => a.runKind === 'submit' && a.verdict === 'accepted' && same(a.institutionId, inst) && same(a.userId, uid)).map((a) => a.questionId))]);
  mock.method(questionRepo, 'countAttemptsFor', async (qid) => db.attempts.filter((a) => same(a.questionId, qid)).length);

  mock.method(questionRepo, 'addEventBatch', async (doc) => { db.batches.push({ _id: newId(), createdAt: new Date(), ...clone(doc) }); });
  mock.method(questionRepo, 'countEventBatches', async (inst, aid) => db.batches.filter((b) => same(b.attemptId, aid) && same(b.institutionId, inst)).length);

  // seeding helpers for tests
  db.addQuestion = (fields, tests = []) => {
    const d = {
      _id: newId(), institutionId: null, status: 'published', version: 1, type: 'coding', title: 'T', statement: 'S', topic: ['arrays'],
      difficulty: 'easy', languages: ['javascript'], starterCode: {}, timeLimitMs: 2000, memoryLimitKb: 256000, source: 'lecturer', ...fields,
    };
    db.questions.push(d);
    tests.forEach((t, order) => db.tests.push({ _id: newId(), institutionId: d.institutionId, questionId: d._id, weight: 1, comparison: 'trim', visible: false, order, ...t }));
    return d;
  };
  installAssessmentWorld(world); // assessments share the attempts / batches stored above
  return db;
};
