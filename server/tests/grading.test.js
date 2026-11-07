// Grading queue: the AI suggests, a human decides. AI is stubbed; no database.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installAnalyticsWorld } from './support/analyticsWorld.js';
import aiService from '../controllers/services/aiService.js';
import app from '../app.js';

let w, db, adminA, lecA1, lecA2, lecB, stu, stuOther, course, cohort, qShort, item;
const as = (u) => ({ Cookie: w.cookie(u) });
const criteria = [{ name: 'Accuracy', description: 'correct', maxPoints: 6 }, { name: 'Clarity', description: 'clear', maxPoints: 4 }];

beforeEach(() => {
  w = makeWorld();
  w.install();
  db = installAnalyticsWorld(w);
  mock.method(console, 'error', () => {});
  adminA = w.addUser({ email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecA1 = w.addUser({ email: 'l1@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  stu = w.addUser({ name: 'Ann', email: 'ann@a.edu', role: 'student', institutionId: IDS.instA });
  stuOther = w.addUser({ name: 'Bob', email: 'bob@a.edu', role: 'student', institutionId: IDS.instA }); // not in lecA1 course
  course = { _id: newId(), institutionId: IDS.instA, code: 'CS101', title: 'Intro', ownerId: lecA1._id };
  cohort = { _id: newId(), institutionId: IDS.instA, courseId: course._id, name: 'G1' };
  w.courses.push(course);
  w.cohorts.push(cohort);
  w.enrollments.push({ institutionId: IDS.instA, userId: stu._id, kind: 'student', courseId: course._id, cohortId: cohort._id });
  qShort = db.addQuestion({ institutionId: IDS.instA, type: 'short', title: 'Explain recursion', statement: 'Explain recursion.', topic: ['recursion'] });
  db.rubrics.push({ _id: newId(), institutionId: IDS.instA, questionId: qShort._id, criteria });
  item = db.addAttempt({ institutionId: IDS.instA, userId: stu._id, questionId: qShort._id, verdict: 'pending_review', score: null, needsReview: true, answer: 'A function that calls itself.' });
});
afterEach(() => mock.restoreAll());

const stubAi = (points = [5, 3]) => mock.method(aiService, 'suggestRubricScore', async () => ({
  criteria: [{ name: 'accuracy', points: points[0], reason: 'mostly right' }, { name: 'Clarity', points: points[1], reason: 'ok' }, { name: 'Invented', points: 99, reason: 'x' }],
  summary: 'decent',
}));

test('roles: students 403, career officers 403, unknown or other-university items 404', async () => {
  const co = w.addUser({ email: 'co@a.edu', role: 'career_officer', institutionId: IDS.instA });
  assert.equal((await request(app).get('/api/grading/queue')).status, 401);
  assert.equal((await request(app).get('/api/grading/queue').set(as(stu))).status, 403);
  assert.equal((await request(app).get('/api/grading/queue').set(as(co))).status, 403);
  assert.equal((await request(app).get(`/api/grading/${item._id}`).set(as(stu))).status, 403);
  assert.equal((await request(app).get(`/api/grading/${item._id}`).set(as(lecB))).status, 404);
  assert.equal((await request(app).get(`/api/grading/${item._id}`).set(as(lecA2))).status, 404, 'lecturer of another course');
  assert.equal((await request(app).get(`/api/grading/${newId()}`).set(as(lecA1))).status, 404);
  assert.equal((await request(app).patch(`/api/grading/${item._id}`).set(as(lecA2)).send({ criteria: [] })).status, 404);
  assert.equal((await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA2))).status, 404);
});

test('queue lists pending answers only from the callers own courses', async () => {
  db.addAttempt({ institutionId: IDS.instA, userId: stuOther._id, questionId: qShort._id, verdict: 'pending_review', needsReview: true, answer: 'x' });
  const mine = await request(app).get('/api/grading/queue').set(as(lecA1));
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.items.map((i) => i.studentName), ['Ann']);
  assert.equal(mine.body.items[0].questionTitle, 'Explain recursion');
  assert.equal(mine.body.items[0].answer, undefined, 'answers only on the item view');
  assert.equal((await request(app).get('/api/grading/queue').set(as(lecA2))).body.count, 0);
  assert.equal((await request(app).get('/api/grading/queue').set(as(lecB))).body.count, 0);
  assert.equal((await request(app).get('/api/grading/queue').set(as(adminA))).body.count, 2);
  assert.equal((await request(app).get('/api/grading/queue').query({ courseId: String(course._id) }).set(as(adminA))).body.count, 1);
  assert.equal((await request(app).get('/api/grading/queue').query({ courseId: String(course._id) }).set(as(lecA2))).status, 404);
});

test('item view shows question, rubric and answer', async () => {
  const res = await request(app).get(`/api/grading/${item._id}`).set(as(lecA1));
  assert.equal(res.status, 200);
  assert.equal(res.body.item.answer, 'A function that calls itself.');
  assert.equal(res.body.item.rubric.length, 2);
  assert.equal(res.body.item.rubricTotal, 10);
  assert.equal(res.body.item.aiSuggestion, null);
  assert.equal(res.body.item.status, 'pending_review');
});

test('flow: AI suggests (stored as ai, no score) -> lecturer overrides -> final source human with confirmedBy', async () => {
  stubAi();
  const s = await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1));
  assert.equal(s.status, 200, s.text);
  assert.equal(s.body.aiSuggestion.source, 'ai');
  assert.deepEqual(s.body.aiSuggestion.criteria.map((c) => [c.name, c.points]), [['Accuracy', 5], ['Clarity', 3]], 'clamped to the rubric, invented criteria dropped');
  assert.equal(s.body.aiSuggestion.total, 8);
  const stored = db.attempts.find((a) => String(a._id) === String(item._id));
  assert.equal(stored.score, null, 'a suggestion is never the score');
  assert.equal(stored.scoreSource, undefined);
  assert.equal(stored.needsReview, true);
  // unconfirmed AI is excluded from analytics
  const hm = await request(app).get('/api/analytics/lecturer/topic-heatmap').query({ courseId: String(course._id) }).set(as(lecA1));
  assert.equal(hm.body.excluded, 1);
  assert.deepEqual(hm.body.topics, []);

  const bad = await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({ criteria: [{ name: 'Accuracy', points: 7 }, { name: 'Clarity', points: 1 }] });
  assert.equal(bad.status, 400, 'points above the criterion maximum');
  const partial = await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({ criteria: [{ name: 'Accuracy', points: 4 }] });
  assert.equal(partial.status, 400);

  const ok = await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({
    criteria: [{ name: 'Accuracy', points: 3, comment: 'misses base case' }, { name: 'Clarity', points: 4 }], comment: 'Needs the base case',
  });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.item.final.source, 'human');
  assert.equal(ok.body.item.final.confirmedBy, lecA1._id);
  assert.equal(ok.body.item.final.overrodeAi, true);
  assert.equal(ok.body.item.final.total, 7);
  assert.equal(ok.body.item.score, 70);
  assert.equal(ok.body.item.scoreSource, 'human');
  assert.equal(ok.body.item.aiSuggestion.source, 'ai', 'the AI suggestion is kept for the record');
  assert.equal(stored.needsReview, false);
  assert.equal((await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({ criteria: [] })).status, 409, 'cannot confirm twice');
  assert.equal((await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1))).status, 409);
  assert.deepEqual(w.audit.map((a) => a.action).filter((a) => a.startsWith('grading.')), ['grading.suggest', 'grading.confirm']);
  assert.equal((await request(app).get('/api/grading/queue').set(as(lecA1))).body.count, 0);
  assert.equal((await request(app).get('/api/grading/queue').query({ status: 'reviewed' }).set(as(lecA1))).body.count, 1);
  // now the confirmed human score counts in analytics
  const after = await request(app).get('/api/analytics/lecturer/topic-heatmap').query({ courseId: String(course._id) }).set(as(lecA1));
  assert.equal(after.body.excluded, 0);
  assert.equal(after.body.columns[0].mean, 70);
});

test('a lecturer can accept the AI suggestion on a single item', async () => {
  stubAi([6, 4]);
  await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1));
  const ok = await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({ acceptAiSuggestion: true });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.item.score, 100);
  assert.equal(ok.body.item.final.acceptedAiSuggestion, true);
  assert.equal(ok.body.item.final.source, 'human');
  const none = db.addAttempt({ institutionId: IDS.instA, userId: stu._id, questionId: qShort._id, verdict: 'pending_review', needsReview: true, answer: 'y' });
  assert.equal((await request(app).patch(`/api/grading/${none._id}`).set(as(lecA1)).send({ acceptAiSuggestion: true })).status, 400, 'nothing to accept');
});

test('bulk confirm only touches explicitly selected items that carry an AI suggestion', async () => {
  stubAi([5, 3]);
  const b = db.addAttempt({ institutionId: IDS.instA, userId: stu._id, questionId: qShort._id, verdict: 'pending_review', needsReview: true, answer: 'b' });
  const c = db.addAttempt({ institutionId: IDS.instA, userId: stu._id, questionId: qShort._id, verdict: 'pending_review', needsReview: true, answer: 'c' });
  const other = db.addAttempt({ institutionId: IDS.instA, userId: stuOther._id, questionId: qShort._id, verdict: 'pending_review', needsReview: true, answer: 'd' });
  for (const a of [item, b, other]) await request(app).post(`/api/grading/${a._id}/suggest`).set(as(adminA));
  const res = await request(app).post('/api/grading/bulk-confirm').set(as(lecA1)).send({ items: [
    { attemptId: String(item._id), decision: 'accept_ai_suggestion' },
    { attemptId: String(b._id) }, // no explicit decision
    { attemptId: String(c._id), decision: 'accept_ai_suggestion' }, // no suggestion stored
    { attemptId: String(other._id), decision: 'accept_ai_suggestion' }, // not this lecturer's student
  ] });
  assert.equal(res.status, 200, res.text);
  const by = Object.fromEntries(res.body.results.map((r) => [r.attemptId, r.status]));
  assert.deepEqual(by, { [item._id]: 'confirmed', [b._id]: 'skipped', [c._id]: 'skipped', [other._id]: 'skipped' });
  assert.equal(db.attempts.find((a) => a._id === item._id).scoreSource, 'human');
  assert.equal(db.attempts.find((a) => a._id === b._id).score, null);
  assert.equal(db.attempts.find((a) => a._id === other._id).needsReview, true);
  assert.equal((await request(app).post('/api/grading/bulk-confirm').set(as(lecA1)).send({})).status, 400);
  assert.equal((await request(app).post('/api/grading/bulk-confirm').set(as(lecA1)).send({ items: 'all' })).status, 400);
  assert.ok(w.audit.some((a) => a.action === 'grading.bulk_confirm' && a.meta.confirmed === 1));
});

test('AI monthly cap exceeded: clear 429 with manual grading still possible', async () => {
  mock.method(aiService, 'suggestRubricScore', async () => { throw Object.assign(new Error('cap'), { code: 'AI_MONTHLY_CAP', status: 429 }); });
  const res = await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1));
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'AI_MONTHLY_CAP');
  assert.equal(res.body.manualGradingAvailable, true);
  const manual = await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({ criteria: [{ name: 'Accuracy', points: 6 }, { name: 'Clarity', points: 2 }] });
  assert.equal(manual.status, 200);
  assert.equal(manual.body.item.final.overrodeAi, false);
});

test('AI failure returns 502 and questions without a rubric cannot be suggested or graded', async () => {
  mock.method(aiService, 'suggestRubricScore', async () => { throw new Error('model down'); });
  const res = await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1));
  assert.equal(res.status, 502);
  assert.equal(res.body.manualGradingAvailable, true);
  db.rubrics.length = 0;
  assert.equal((await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1))).status, 409);
  assert.equal((await request(app).patch(`/api/grading/${item._id}`).set(as(lecA1)).send({ criteria: [] })).status, 409);
});

test('the real AI path counts against the university monthly cap', async () => {
  const { usageRepo, resetAiCapCache } = await import('../services/aiUsage.js');
  const axios = (await import('axios')).default;
  resetAiCapCache();
  mock.method(usageRepo, 'getCap', async () => 0);
  mock.method(usageRepo, 'increment', async () => ({ calls: 1 }));
  const post = mock.method(axios, 'post', async () => { throw new Error('model must not be called'); });
  mock.method(console, 'log', () => {});
  const res = await request(app).post(`/api/grading/${item._id}/suggest`).set(as(lecA1));
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'AI_MONTHLY_CAP');
  assert.equal(post.mock.callCount(), 0);
  resetAiCapCache();
});
