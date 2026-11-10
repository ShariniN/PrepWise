// Admin analytics: adoption, improvement, AI usage and the evidence summary. No database; repositories are in-memory fakes.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installAnalyticsWorld } from './support/analyticsWorld.js';
import * as agg from '../analytics/aggregate.js';
import app from '../app.js';

let w, db, adminA, lecA1, adminB, students, stuB, qCode, qTopic2;
const as = (u) => ({ Cookie: w.cookie(u) });
const ago = (days, extraMs = 0) => new Date(Date.now() - days * 86400000 + extraMs);

beforeEach(() => {
  w = makeWorld();
  w.install();
  db = installAnalyticsWorld(w);
  mock.method(console, 'error', () => {});
  adminA = w.addUser({ email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecA1 = w.addUser({ email: 'l1@a.edu', role: 'lecturer', institutionId: IDS.instA });
  adminB = w.addUser({ email: 'admin@b.edu', role: 'university_admin', institutionId: IDS.instB });
  students = ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Flo'].map((n) => w.addUser({ name: n, email: `${n.toLowerCase()}@a.edu`, role: 'student', institutionId: IDS.instA }));
  stuB = w.addUser({ name: 'Zed', email: 'z@b.edu', role: 'student', institutionId: IDS.instB });
  qCode = db.addQuestion({ institutionId: IDS.instA, title: 'Sum', topic: ['arrays'] }, [{ input: '1', expectedOutput: '1', visible: true }]);
  qTopic2 = db.addQuestion({ institutionId: IDS.instA, title: 'Fact', topic: ['recursion'] }, [{ input: '1', expectedOutput: '1', visible: true }]);
});
afterEach(() => mock.restoreAll());

const sub = (u, q, fields) => db.addAttempt({ institutionId: IDS.instA, userId: u._id, questionId: q._id, ...fields });
const q = (path, user, query = {}) => request(app).get(path).query(query).set(as(user));

test('students, lecturers and unauthenticated users never reach admin analytics', async () => {
  for (const u of ['/api/analytics/admin/overview', '/api/analytics/admin/evidence']) {
    assert.equal((await request(app).get(u)).status, 401, u);
    assert.equal((await q(u, students[0])).status, 403, u);
    assert.equal((await q(u, lecA1)).status, 403, u);
  }
});

test('fallback-sourced and unconfirmed AI practice scores are excluded and counted', () => {
  const rows = [
    { runKind: 'submit', score: 100, scoreSource: 'tests' },
    { runKind: 'submit', score: 100 },
    { runKind: 'submit', score: 90, scoreSource: 'fallback' },
    { runKind: 'submit', score: 80, scoreSource: 'ai' },
    { runKind: 'submit', score: null, needsReview: true, review: { aiSuggestion: { total: 5 } } },
    { runKind: 'submit', score: 40, scoreSource: 'human' },
    { runKind: 'run', score: null },
  ];
  const { eligible, excluded } = agg.partitionAttempts(rows);
  assert.equal(excluded, 3);
  assert.deepEqual(eligible.map((a) => a.score), [100, 100, 40]);
});

test('admin overview: active students vs limit, institution-wide improvement, AI usage; other universities never counted', async () => {
  students.slice(0, 2).forEach((s) => sub(s, qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(3) }));
  sub(students[2], qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(20) });
  sub(stuB, qCode, { institutionId: IDS.instB, score: 50, verdict: 'wrong_answer' });
  // five students improve between a first and a later attempt
  students.slice(0, 5).forEach((s) => { sub(s, qTopic2, { score: 40, verdict: 'wrong_answer', createdAt: ago(10) }); sub(s, qTopic2, { score: 80, verdict: 'wrong_answer', createdAt: ago(9) }); });
  db.aiCalls[IDS.instA] = 150;
  db.aiCalls[IDS.instB] = 999;
  const res = await q('/api/analytics/admin/overview', adminA);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.adoption.activeStudents7d, 2);
  assert.equal(res.body.adoption.activeStudents30d, 6 - 1);
  assert.equal(res.body.adoption.contractedStudentLimit, 3);
  assert.equal(res.body.aiUsage.calls, 150);
  assert.equal(res.body.aiUsage.cap, 20000);
  assert.equal(res.body.improvement.meanFirst, 40);
  assert.equal(res.body.improvement.meanLatest, 80);
  assert.equal(res.body.improvement.delta, 40);
  assert.equal(res.body.improvement.cohorts, undefined, 'no cohorts any more');
  assert.equal(JSON.stringify(res.body).includes('Zed'), false);
  const b = await q('/api/analytics/admin/overview', adminB);
  assert.equal(b.body.aiUsage.calls, 999);
  assert.equal(b.body.adoption.activeStudents30d, 1);
  assert.equal(b.body.improvement.insufficientData, true);
});

test('evidence summary is counts only; includeStudents=1 adds students and writes an audit entry', async () => {
  sub(students[0], qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(2) });
  db.interviews.push({ _id: newId(), institutionId: IDS.instA, userId: students[0]._id, status: 'completed', createdAt: new Date(), resumeText: 'SECRET-CV-TEXT', responses: [] });
  const plain = await q('/api/analytics/admin/evidence', adminA);
  assert.equal(plain.status, 200);
  assert.equal(plain.body.students, undefined);
  assert.equal(plain.body.summary.practiceSubmissionsTotal, 1);
  assert.equal(plain.body.summary.mockInterviewsCompleted, 1);
  assert.equal(plain.body.summary.courses, undefined);
  assert.equal(plain.body.cohorts, undefined);
  assert.equal(JSON.stringify(plain.body).includes('@a.edu'), false);
  assert.equal(JSON.stringify(plain.body).includes('SECRET'), false);
  assert.equal(w.audit.some((a) => a.action === 'analytics.export.evidence_students'), false);
  const withStudents = await q('/api/analytics/admin/evidence', adminA, { includeStudents: '1' });
  assert.equal(withStudents.body.students.length, 6);
  const entry = w.audit.find((a) => a.action === 'analytics.export.evidence_students');
  assert.ok(entry);
  assert.equal(String(entry.institutionId), IDS.instA);
  const csv = await request(app).get('/api/analytics/admin/evidence').query({ format: 'csv' }).set(as(adminA));
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /practiceSubmissionsTotal,1/);
  assert.equal(csv.text.includes('@a.edu'), false);
});

test('csv cells neutralise spreadsheet formulas and quote awkward values', () => {
  assert.equal(agg.csvCell('=1+1'), "'=1+1");
  assert.equal(agg.csvCell('+cmd'), "'+cmd");
  assert.equal(agg.csvCell('-2'), "'-2");
  assert.equal(agg.csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(agg.csvCell('a,b'), '"a,b"');
  assert.equal(agg.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(agg.csvCell(null), '');
});
