// In-memory stand-in for the practice repo. It honours the same tenancy rules as the real repository:
// reads see `institutionId in [null, caller]`, writes match the caller's institution exactly.
import { mock } from 'node:test';
import questionRepo from '../../modules/practice/practice.repo.js';
import { newId } from '../helpers.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const clone = (o) => (o == null ? o : structuredClone(o));
const readable = (inst, d) => d.institutionId == null || same(d.institutionId, inst);

export const installQuestionWorld = (world) => {
  const db = { questions: [], tests: [], attempts: [] };
  world.qdb = db;

  const q = (id) => db.questions.find((x) => same(x._id, id));
  mock.method(questionRepo, 'listVisible', async (inst, f = {}) => db.questions
    .filter((d) => readable(inst, d) && (!f.status || d.status === f.status) && (!f.type || d.type === f.type)
      && (!f.topic || d.topic?.includes(f.topic)) && (!f.difficulty || d.difficulty === f.difficulty)
      && !(f.excludeIds || []).some((i) => same(i, d._id))).map(clone));
  mock.method(questionRepo, 'findVisible', async (inst, id) => {
    const d = q(id);
    return d && readable(inst, d) ? clone(d) : null;
  });
  mock.method(questionRepo, 'listTests', async (qid) => db.tests.filter((t) => same(t.questionId, qid)).sort((a, b) => a.order - b.order).map(clone));
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

  mock.method(questionRepo, 'createAttempt', async (doc) => {
    const a = { _id: newId(), createdAt: new Date(), updatedAt: new Date(), ...clone(doc) };
    db.attempts.push(a);
    return clone(a);
  });
  mock.method(questionRepo, 'findAttempt', async (inst, uid, id) =>
    clone(db.attempts.find((a) => same(a._id, id) && !a.assessmentSessionId && same(a.institutionId, inst) && same(a.userId, uid))) || null);
  mock.method(questionRepo, 'updateAttempt', async (inst, uid, id, patch) => {
    const a = db.attempts.find((x) => same(x._id, id) && same(x.institutionId, inst) && same(x.userId, uid));
    if (!a) return null;
    Object.assign(a, clone(patch), { updatedAt: new Date() });
    return clone(a);
  });
  mock.method(questionRepo, 'findDraft', async (inst, uid, qid) =>
    clone(db.attempts.find((a) => a.runKind === 'draft' && !a.assessmentSessionId && same(a.institutionId, inst) && same(a.userId, uid) && same(a.questionId, qid))) || null);
  mock.method(questionRepo, 'solvedQuestionIds', async (inst, uid) => [...new Set(db.attempts
    .filter((a) => a.runKind === 'submit' && a.verdict === 'accepted' && !a.assessmentSessionId && same(a.institutionId, inst) && same(a.userId, uid)).map((a) => a.questionId))]);

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
  return db;
};
