// In-memory stand-ins for analyticsRepo, gradingRepo and the AI usage store. Like the real repositories they
// filter by institutionId, so a controller that forgets to scope a query leaks data and a test fails.
import { mock } from 'node:test';
import analyticsRepo from '../../analytics/repo.js';
import gradingRepo from '../../grading/repo.js';
import { usageRepo } from '../../services/aiUsage.js';
import { installQuestionWorld } from './questionWorld.js';
import { newId } from '../helpers.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const clone = (o) => (o == null ? o : structuredClone(o));
const inIds = (ids, v) => ids.some((i) => same(i, v));

export const installAnalyticsWorld = (world) => {
  const q = installQuestionWorld(world);
  const db = Object.assign(q, { interviews: [], cv: [], skills: [], aiCalls: {} });
  world.adb = db;

  mock.method(analyticsRepo, 'attemptsForStudents', async (inst, ids, { since = null, kinds = null } = {}) => db.attempts
    .filter((a) => same(a.institutionId, inst) && inIds(ids, a.userId) && (!since || new Date(a.createdAt) >= since) && (!kinds || kinds.includes(a.runKind)))
    .map((a) => { const c = clone(a); delete c.source; delete c.answer; return c; }));
  mock.method(analyticsRepo, 'questionsByIds', async (inst, ids) => db.questions
    .filter((d) => inIds(ids, d._id) && (d.institutionId == null || same(d.institutionId, inst))).map(clone));
  mock.method(analyticsRepo, 'testsByQuestion', async (qids) => {
    const out = {};
    for (const t of db.tests.filter((x) => inIds(qids, x.questionId)).sort((a, b) => a.order - b.order)) (out[String(t.questionId)] ||= []).push(clone(t));
    return out;
  });
  mock.method(analyticsRepo, 'interviewsForStudents', async (inst, ids) => db.interviews.filter((i) => same(i.institutionId, inst) && inIds(ids, i.userId)).map(clone));
  mock.method(analyticsRepo, 'cvCounts', async (inst, ids) => {
    const m = {};
    for (const c of db.cv.filter((x) => same(x.institutionId, inst) && inIds(ids, x.userId))) m[String(c.userId)] = (m[String(c.userId)] || 0) + 1;
    return Object.entries(m).map(([userId, count]) => ({ userId, count }));
  });
  mock.method(analyticsRepo, 'skillAssessments', async (inst, ids) => db.skills.filter((x) => same(x.institutionId, inst) && inIds(ids, x.userId)).map(clone));
  mock.method(analyticsRepo, 'activeUserIds', async (inst, ids, since) => {
    const out = new Set();
    for (const a of db.attempts) if (same(a.institutionId, inst) && inIds(ids, a.userId) && ['run', 'submit'].includes(a.runKind) && new Date(a.createdAt) >= since) out.add(String(a.userId));
    for (const i of db.interviews) if (same(i.institutionId, inst) && inIds(ids, i.userId) && new Date(i.createdAt) >= since) out.add(String(i.userId));
    return [...out];
  });

  mock.method(usageRepo, 'getCalls', async (inst) => db.aiCalls[String(inst)] || 0);

  // grading repo, mirroring the Mongo filters
  mock.method(gradingRepo, 'list', async (inst, { status = 'pending', userIds = null, questionId = null } = {}) => db.attempts
    .filter((a) => same(a.institutionId, inst) && a.runKind === 'submit'
      && (status === 'reviewed' ? a.review?.final?.source === 'human' : a.needsReview === true)
      && (!userIds || inIds(userIds, a.userId)) && (!questionId || same(a.questionId, questionId))).map(clone));
  mock.method(gradingRepo, 'find', async (inst, id) => clone(db.attempts.find((a) => same(a._id, id) && same(a.institutionId, inst) && a.runKind === 'submit'
    && (a.needsReview === true || a.review?.final?.source === 'human'))) || null);
  mock.method(gradingRepo, 'saveSuggestion', async (inst, id, s) => {
    const a = db.attempts.find((x) => same(x._id, id) && same(x.institutionId, inst) && x.needsReview === true);
    if (!a) return null;
    a.review = { ...(a.review || {}), aiSuggestion: clone(s) };
    return clone(a);
  });
  mock.method(gradingRepo, 'confirm', async (inst, id, final, score) => {
    const a = db.attempts.find((x) => same(x._id, id) && same(x.institutionId, inst) && x.needsReview === true);
    if (!a) return null;
    Object.assign(a, { review: { ...(a.review || {}), final: clone(final) }, score, scoreSource: 'human', verdict: 'reviewed', needsReview: false });
    return clone(a);
  });

  // seeding helper: one attempt row
  db.addAttempt = (fields) => {
    const a = { _id: newId(), runKind: 'submit', perTest: [], score: null, createdAt: new Date(), ...fields };
    db.attempts.push(a);
    return a;
  };
  return db;
};
