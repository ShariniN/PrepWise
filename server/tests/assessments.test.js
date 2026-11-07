// Assessments: tenancy, lecturer scoping, server-enforced timer, accommodations, extensions, variants, assessment-mode answers.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import { computeBaseDeadline, effectiveStatus, pickVariant, seededShuffle, hashInt, sessionWriteBlock, GRACE_MS } from '../services/assessments/rules.js';
import app from '../app.js';

const DOUBLE = "const n = parseInt(require('fs').readFileSync(0,'utf8').trim(), 10);\nconsole.log(n * 2);";
const HOUR = 3600e3;

let w, db, lecA, lecA2, admA, lecB, stu, stu2, stuOut, stuB, courseA, cohortA, courseB, qCode, qMcq, qMcq2;
beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  exec.resetCache(); exec.setProvider(new VmProvider());
  lecA = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  admA = w.addUser({ email: 'ad@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  stu = w.addUser({ email: 's1@a.edu', institutionId: IDS.instA });
  stu2 = w.addUser({ email: 's2@a.edu', institutionId: IDS.instA });
  stuOut = w.addUser({ email: 's3@a.edu', institutionId: IDS.instA });
  stuB = w.addUser({ email: 's@b.edu', institutionId: IDS.instB });
  courseA = { _id: newId(), institutionId: IDS.instA, code: 'CS1', title: 'CS1', ownerId: lecA._id };
  courseB = { _id: newId(), institutionId: IDS.instB, code: 'CS1', title: 'CS1', ownerId: lecB._id };
  cohortA = { _id: newId(), institutionId: IDS.instA, courseId: courseA._id, name: '2026' };
  w.courses.push(courseA, courseB); w.cohorts.push(cohortA);
  for (const u of [stu, stu2]) w.enrollments.push({ institutionId: IDS.instA, userId: u._id, kind: 'student', courseId: courseA._id, cohortId: cohortA._id });
  qCode = db.addQuestion({ institutionId: IDS.instA, title: 'Double', explanation: 'EXPLAIN_SECRET' }, [
    { input: '3', expectedOutput: '6', visible: true, institutionId: IDS.instA },
    { input: '98765', expectedOutput: '197530', visible: false, institutionId: IDS.instA },
  ]);
  qMcq = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'Pick', options: ['a', 'b'], correct: [1], explanation: 'EXPLAIN_SECRET' });
  qMcq2 = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'Pick 2', options: ['a', 'b'], correct: [0] });
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

const as = (u) => ({ Cookie: w.cookie(u) });
const api = (u) => ({
  get: (p) => request(app).get(`/api/assessments${p}`).set(as(u)),
  post: (p, b) => request(app).post(`/api/assessments${p}`).set(as(u)).send(b),
  put: (p, b) => request(app).put(`/api/assessments${p}`).set(as(u)).send(b),
  patch: (p, b) => request(app).patch(`/api/assessments${p}`).set(as(u)).send(b),
  del: (p) => request(app).delete(`/api/assessments${p}`).set(as(u)),
});
const base = (over = {}) => db_.addAssessment({
  institutionId: IDS.instA, courseId: courseA._id, cohortId: cohortA._id, createdBy: lecA._id, questionIds: [qCode._id, qMcq._id], ...over,
});
const db_ = { addAssessment: (f) => w.adb.addAssessment(f) };
const body = (over = {}) => ({
  title: 'Midterm', courseId: String(courseA._id), cohortId: String(cohortA._id), questionIds: [String(qCode._id), String(qMcq._id)],
  opensAt: new Date(Date.now() + HOUR).toISOString(), closesAt: new Date(Date.now() + 3 * HOUR).toISOString(), durationMinutes: 60, ...over,
});
const start = async (a, u = stu) => (await api(u).post(`/${a._id}/start`)).body.session;

// ---------------------------------------------------------------- pure rules
test('deadline is min(start + duration * (1 + extra%), closesAt)', () => {
  const t0 = new Date('2026-01-01T10:00:00Z');
  const closes = new Date('2026-01-01T13:00:00Z');
  assert.equal(computeBaseDeadline({ startedAt: t0, durationMinutes: 60, closesAt: closes }).toISOString(), '2026-01-01T11:00:00.000Z');
  assert.equal(computeBaseDeadline({ startedAt: t0, durationMinutes: 60, extraTimePercent: 50, closesAt: closes }).toISOString(), '2026-01-01T11:30:00.000Z');
  assert.equal(computeBaseDeadline({ startedAt: t0, durationMinutes: 300, closesAt: closes }).toISOString(), closes.toISOString());
});

test('effective status follows the clock for scheduled assessments only', () => {
  const a = { status: 'scheduled', opensAt: new Date(Date.now() + HOUR), closesAt: new Date(Date.now() + 2 * HOUR) };
  assert.equal(effectiveStatus(a), 'scheduled');
  assert.equal(effectiveStatus({ ...a, opensAt: new Date(Date.now() - HOUR) }), 'open');
  assert.equal(effectiveStatus({ ...a, opensAt: new Date(Date.now() - 2 * HOUR), closesAt: new Date(Date.now() - HOUR) }), 'closed');
  assert.equal(effectiveStatus({ ...a, status: 'draft', opensAt: new Date(Date.now() - HOUR) }), 'draft');
});

test('write block honours the grace period and submitted sessions', () => {
  const now = new Date();
  const s = { status: 'active', baseDeadline: new Date(now.getTime() - 1000), extensionMs: 0 };
  assert.equal(sessionWriteBlock(s, now), null);
  assert.equal(sessionWriteBlock({ ...s, baseDeadline: new Date(now.getTime() - GRACE_MS - 1000) }, now).code, 'TIME_UP');
  assert.equal(sessionWriteBlock({ ...s, baseDeadline: new Date(now.getTime() - GRACE_MS - 1000), extensionMs: 60000 }, now), null);
  assert.equal(sessionWriteBlock({ ...s, status: 'submitted' }, now).code, 'SESSION_ENDED');
});

test('variant choice and shuffle are deterministic per student and assessment', () => {
  const members = [{ _id: 'c' }, { _id: 'a' }, { _id: 'b' }];
  const pick = (u, a) => pickVariant(members, u, a, 'g')._id;
  assert.equal(pick('u1', 'x'), pick('u1', 'x'));
  assert.equal(pickVariant([...members].reverse(), 'u1', 'x', 'g')._id, pick('u1', 'x')); // independent of member order
  const seen = new Set(Array.from({ length: 30 }, (_, i) => pick(`user${i}`, 'x')));
  assert.ok(seen.size > 1, 'different students should spread over variants');
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(seededShuffle(items, hashInt('u', 'a')), seededShuffle(items, hashInt('u', 'a')));
  assert.notDeepEqual(seededShuffle(items, hashInt('u', 'a')), seededShuffle(items, hashInt('v', 'a')));
});

// ---------------------------------------------------------------- staff API
test('only staff create assessments; integrity levels 2 and 3 are rejected', async () => {
  assert.equal((await request(app).post('/api/assessments').send(body())).status, 401);
  assert.equal((await api(stu).post('/', body())).status, 403);
  const ok = await api(lecA).post('/', body());
  assert.equal(ok.status, 201);
  assert.equal(ok.body.assessment.status, 'draft');
  assert.equal(ok.body.assessment.integrityLevel, 0);
  for (const level of [2, 3]) {
    const r = await api(lecA).post('/', body({ integrityLevel: level }));
    assert.equal(r.status, 400);
    assert.match(r.body.message, /not available yet/);
  }
  assert.equal((await api(lecA).post('/', body({ integrityLevel: 1 }))).body.assessment.integrityLevel, 1);
  assert.equal((await api(lecA).post('/', body({ durationMinutes: 0 }))).status, 400);
  assert.equal((await api(lecA).post('/', body({ closesAt: new Date(Date.now() - HOUR).toISOString() }))).status, 400);
  assert.equal((await api(lecA).post('/', body({ flagThresholds: { bogus: 1 } }))).status, 400);
  assert.equal((await api(lecA).post('/', body({ questionIds: [String(qCode._id), String(qCode._id)] }))).status, 400);
});

test('tenant isolation: other university questions, courses and assessments are invisible', async () => {
  const qB = db.addQuestion({ institutionId: IDS.instB, type: 'mcq', options: ['a', 'b'], correct: [0] });
  assert.equal((await api(lecA).post('/', body({ questionIds: [String(qB._id)] }))).status, 400);
  assert.equal((await api(lecB).post('/', body())).status, 404); // course of university A
  const a = base();
  assert.equal((await api(lecB).get(`/${a._id}`)).status, 404);
  assert.equal((await api(lecB).put(`/${a._id}`, { title: 'x' })).status, 404);
  assert.equal((await api(lecB).patch(`/${a._id}/status`, { status: 'closed' })).status, 404);
  assert.equal((await api(lecB).get(`/${a._id}/sessions`)).status, 404);
  assert.equal((await api(stuB).get(`/${a._id}`)).status, 404);
  assert.equal((await api(stuB).post(`/${a._id}/start`)).status, 404);
  assert.deepEqual((await api(lecB).get('/')).body.assessments, []);
  assert.deepEqual((await api(stuB).get('/')).body.assessments, []);
});

test('lecturers only manage assessments in their own courses; admins manage all in their university', async () => {
  const a = base();
  assert.equal((await api(lecA2).get(`/${a._id}`)).status, 404);
  assert.equal((await api(lecA2).post('/', body())).status, 404);
  assert.deepEqual((await api(lecA2).get('/')).body.assessments, []);
  assert.equal((await api(lecA).get('/')).body.assessments.length, 1);
  assert.equal((await api(admA).get(`/${a._id}`)).status, 200);
  w.enrollments.push({ institutionId: IDS.instA, userId: lecA2._id, kind: 'lecturer', courseId: courseA._id, cohortId: null });
  assert.equal((await api(lecA2).get(`/${a._id}`)).status, 200);
});

test('status workflow: publish checks, no un-publish after students started, close', async () => {
  const created = (await api(lecA).post('/', body())).body.assessment;
  assert.equal((await api(lecA).patch(`/${created.id}/status`, { status: 'closed' })).status, 409);
  const sched = await api(lecA).patch(`/${created.id}/status`, { status: 'scheduled' });
  assert.equal(sched.status, 200);
  assert.equal(sched.body.assessment.effectiveStatus, 'scheduled');
  assert.equal((await api(stu).get(`/${created.id}`)).status, 200);
  assert.equal((await api(stu).post(`/${created.id}/start`)).status, 409); // not open yet
  const open = await api(lecA).patch(`/${created.id}/status`, { status: 'open' });
  assert.equal(open.body.assessment.effectiveStatus, 'open');
  assert.equal((await api(stu).post(`/${created.id}/start`)).status, 201);
  assert.equal((await api(lecA).patch(`/${created.id}/status`, { status: 'draft' })).status, 409);
  assert.equal((await api(lecA).put(`/${created.id}`, { durationMinutes: 5 })).status, 409);
  assert.equal((await api(lecA).put(`/${created.id}`, { title: 'Renamed' })).status, 200);
  assert.equal((await api(lecA).patch(`/${created.id}/status`, { status: 'closed' })).body.assessment.effectiveStatus, 'closed');
  assert.ok(w.audit.some((x) => x.action === 'assessment.status'));
});

test('a draft or unpublished question blocks publishing', async () => {
  const created = (await api(lecA).post('/', body())).body.assessment;
  db.questions.find((q) => String(q._id) === String(qMcq._id)).status = 'draft';
  const r = await api(lecA).patch(`/${created.id}/status`, { status: 'scheduled' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'PUBLISH_BLOCKED');
});

// ---------------------------------------------------------------- students: list and start
test('students see only scheduled/open assessments of their own cohort', async () => {
  const open = base();
  base({ status: 'draft' });
  const otherCohort = { _id: newId(), institutionId: IDS.instA, courseId: courseA._id, name: 'other' };
  w.cohorts.push(otherCohort);
  base({ cohortId: otherCohort._id, title: 'Other cohort' });
  const list = (await api(stu).get('/')).body.assessments;
  assert.deepEqual(list.map((x) => x.id), [String(open._id)]);
  assert.equal(list[0].canStart, true);
  assert.deepEqual((await api(stuOut).get('/')).body.assessments, []); // not enrolled
  assert.equal((await api(stuOut).post(`/${open._id}/start`)).status, 404);
  assert.equal((await api(stuOut).get(`/${open._id}`)).status, 404);
});

test('start creates a server-side deadline and resumes the same session instead of a second one', async () => {
  const a = base({ durationMinutes: 45 });
  const before = Date.now();
  const first = await api(stu).post(`/${a._id}/start`);
  assert.equal(first.status, 201);
  const s = first.body.session;
  const span = new Date(s.deadline) - new Date(s.serverStartedAt);
  assert.equal(span, 45 * 60 * 1000);
  assert.ok(new Date(s.serverStartedAt) >= before - 5);
  assert.equal(s.questions.length, 2);
  assert.equal(s.signals.length, 13);
  const again = await api(stu).post(`/${a._id}/start`);
  assert.equal(again.status, 200);
  assert.equal(again.body.resumed, true);
  assert.equal(again.body.session.id, s.id);
  assert.equal(w.adb.sessions.length, 1);
});

test('the client cannot influence the deadline', async () => {
  const a = base({ durationMinutes: 30 });
  const r = await request(app).post(`/api/assessments/${a._id}/start`).set(as(stu))
    .send({ deadline: new Date(Date.now() + 99 * HOUR), durationMinutes: 999, extraTimePercent: 500, serverStartedAt: new Date(0) });
  assert.equal(new Date(r.body.session.deadline) - new Date(r.body.session.serverStartedAt), 30 * 60 * 1000);
});

test('attempts allowed: a submitted session can be followed only while attempts remain', async () => {
  const a = base({ attemptsAllowed: 2 });
  const s1 = await start(a);
  await api(stu).post(`/sessions/${s1.id}/finish`);
  const s2 = await api(stu).post(`/${a._id}/start`);
  assert.equal(s2.status, 201);
  assert.equal(s2.body.session.attemptNo, 2);
  await api(stu).post(`/sessions/${s2.body.session.id}/finish`);
  const s3 = await api(stu).post(`/${a._id}/start`);
  assert.equal(s3.status, 409);
  assert.equal(s3.body.code, 'NO_ATTEMPTS_LEFT');
});

test('accommodations: extra time applies to that student only and is capped by closesAt', async () => {
  const a = base({ durationMinutes: 60, closesAt: new Date(Date.now() + 80 * 60 * 1000) });
  assert.equal((await api(stu).put(`/${a._id}/accommodations/${stu._id}`, { extraTimePercent: 50 })).status, 403);
  assert.equal((await api(lecA2).put(`/${a._id}/accommodations/${stu._id}`, { extraTimePercent: 50 })).status, 404);
  assert.equal((await api(lecA).put(`/${a._id}/accommodations/${stuOut._id}`, { extraTimePercent: 50 })).status, 404); // not enrolled
  assert.equal((await api(lecA).put(`/${a._id}/accommodations/${stu._id}`, { extraTimePercent: 500 })).status, 400);
  assert.equal((await api(lecA).put(`/${a._id}/accommodations/${stu._id}`, { extraTimePercent: 50, disabledSignals: ['paste', 'nope'] })).status, 400);
  const ok = await api(lecA).put(`/${a._id}/accommodations/${stu._id}`, { extraTimePercent: 50, disabledSignals: ['fullscreen_exit'] });
  assert.equal(ok.status, 200);
  const mine = await start(a, stu);
  const other = await start(a, stu2);
  const mins = (s) => (new Date(s.deadline) - new Date(s.serverStartedAt)) / 60000;
  assert.equal(Math.round(mins(other)), 60);
  assert.ok(mins(mine) > 75 && mins(mine) <= 80.01, `capped by closesAt, got ${mins(mine)}`); // 90 min wanted, closes in 80
  assert.ok(!mine.signals.includes('fullscreen_exit'));
  assert.ok(other.signals.includes('fullscreen_exit'));
  assert.ok(w.audit.some((x) => x.action === 'assessment.accommodation'));
});

// ---------------------------------------------------------------- the timer
const expire = (sessionId, msAgo) => { const s = w.adb.sessions.find((x) => String(x._id) === String(sessionId)); s.baseDeadline = new Date(Date.now() - msAgo); return s; };
const mcqUrl = (s, q = qMcq) => `/sessions/${s.id}/questions/${q._id}`;

test('timer: run, submit, autosave and events are rejected after the deadline (and accepted inside the grace period)', async () => {
  const a = base();
  const s = await start(a);
  assert.equal((await api(stu).post(`${mcqUrl(s, qCode)}/run`, { language: 'javascript', source: DOUBLE })).status, 200);
  expire(s.id, 3000); // 3 s late: inside the grace period
  assert.equal((await api(stu).put(`${mcqUrl(s, qCode)}/autosave`, { language: 'javascript', source: 'x' })).status, 200);
  expire(s.id, GRACE_MS + 5000);
  const late = [
    await api(stu).post(`${mcqUrl(s, qCode)}/run`, { language: 'javascript', source: DOUBLE }),
    await api(stu).post(`${mcqUrl(s, qCode)}/submit`, { language: 'javascript', source: DOUBLE }),
    await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] }),
    await api(stu).put(`${mcqUrl(s, qCode)}/autosave`, { language: 'javascript', source: 'late' }),
    await api(stu).post(`${mcqUrl(s, qCode)}/events`, { events: [{ t: 1, type: 'insert' }] }),
    await api(stu).get(mcqUrl(s)),
  ];
  for (const r of late) {
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'TIME_UP');
    assert.match(r.body.message, /Time is up/);
  }
  const stored = w.qdb.attempts.filter((x) => x.assessmentSessionId && x.runKind === 'submit');
  assert.equal(stored.length, 0, 'nothing was stored after the deadline');
  assert.equal(w.qdb.attempts.find((x) => x.runKind === 'draft').source, 'x', 'the late autosave did not overwrite the draft');
});

test('timer: the client clock is irrelevant and a lecturer extension is audited and effective', async () => {
  const a = base();
  const s = await start(a);
  expire(s.id, GRACE_MS + 60000);
  assert.equal((await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] })).status, 409);
  assert.equal((await api(stu).post(`/${a._id}/sessions/${s.id}/extend`, { minutes: 10, reason: 'x y z' })).status, 403);
  assert.equal((await api(lecA2).post(`/${a._id}/sessions/${s.id}/extend`, { minutes: 10, reason: 'power cut' })).status, 404);
  assert.equal((await api(lecB).post(`/${a._id}/sessions/${s.id}/extend`, { minutes: 10, reason: 'power cut' })).status, 404);
  assert.equal((await api(lecA).post(`/${a._id}/sessions/${s.id}/extend`, { minutes: 10 })).status, 400); // reason required
  assert.equal((await api(lecA).post(`/${a._id}/sessions/${s.id}/extend`, { minutes: 0, reason: 'power cut' })).status, 400);
  const ext = await api(lecA).post(`/${a._id}/sessions/${s.id}/extend`, { minutes: 10, reason: 'power cut' });
  assert.equal(ext.status, 200);
  assert.equal((await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] })).status, 200);
  const entry = w.audit.find((x) => x.action === 'assessment.extend');
  assert.ok(entry);
  assert.equal(entry.meta.minutes, 10);
  assert.equal(entry.meta.reason, 'power cut');
  assert.equal(String(entry.actor), String(lecA._id));
  const listed = (await api(lecA).get(`/${a._id}/sessions`)).body.sessions;
  assert.equal(listed[0].extensions[0].reason, 'power cut');
  assert.equal(listed[0].studentEmail, 's1@a.edu');
});

test('timer: finished sessions and closed assessments accept no more writes; sessions belong to their student', async () => {
  const a = base();
  const s = await start(a);
  assert.equal((await api(stu2).get(`/sessions/${s.id}`)).status, 404);
  assert.equal((await api(stu2).post(`${mcqUrl(s)}/submit`, { selected: [1] })).status, 404);
  assert.equal((await api(stuB).get(`/sessions/${s.id}`)).status, 404);
  assert.equal((await api(lecA).get(`/sessions/${s.id}`)).status, 403);
  assert.equal((await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] })).status, 200);
  await api(lecA).patch(`/${a._id}/status`, { status: 'closed' });
  const closed = await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] });
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, 'ASSESSMENT_CLOSED');
  const a2 = base({ title: 'two' });
  const s2 = await start(a2, stu2);
  assert.equal((await api(stu2).post(`/sessions/${s2.id}/finish`)).status, 200);
  assert.equal((await api(stu2).post(`/sessions/${s2.id}/questions/${qMcq._id}/submit`, { selected: [1] })).body.code, 'SESSION_ENDED');
  const a3 = base({ title: 'three' });
  const s3 = await start(a3, stu2);
  assert.equal((await api(stu2).post(`/sessions/${s3.id}/questions/${qMcq2._id}/submit`, { selected: [0] })).status, 404); // not in this assessment
});

// ---------------------------------------------------------------- assessment-mode answers
test('assessment mode: answers are marked server-side but the student sees no score, tests, hints or explanation', async () => {
  const a = base();
  const s = await start(a);
  const q = await api(stu).get(mcqUrl(s, qCode));
  assert.equal(q.status, 200);
  const text = JSON.stringify(q.body);
  assert.ok(!text.includes('EXPLAIN_SECRET') && !text.includes('197530') && !text.includes('learningOutcome'));
  assert.equal(q.body.question.hiddenTestCount, 1);

  const run = await api(stu).post(`${mcqUrl(s, qCode)}/run`, { language: 'javascript', source: DOUBLE });
  assert.equal(run.status, 200);
  assert.ok(!JSON.stringify(run.body).includes('197530'));
  assert.equal(run.body.tests.length, 1);

  const sub = await api(stu).post(`${mcqUrl(s, qCode)}/submit`, { language: 'javascript', source: DOUBLE });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.submitted, true);
  for (const k of ['score', 'verdict', 'passed', 'total', 'tests', 'explanation']) assert.ok(!(k in sub.body), `submit leaked ${k}`);
  const mcq = await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] });
  assert.ok(!('score' in mcq.body) && !JSON.stringify(mcq.body).includes('EXPLAIN_SECRET'));

  const stored = w.qdb.attempts.filter((x) => x.runKind === 'submit');
  assert.equal(stored.length, 2);
  assert.ok(stored.every((x) => String(x.assessmentSessionId) === s.id), 'attempts carry assessmentSessionId');
  assert.equal(stored.find((x) => x.language === 'javascript').score, 100);
  assert.equal(w.qdb.attempts.filter((x) => x.runKind === 'run')[0].assessmentSessionId, w.adb.sessions[0]._id);
});

test('results stay hidden until releaseResults, then show verdicts and scores after the session ends', async () => {
  const a = base();
  const s = await start(a);
  await api(stu).post(`${mcqUrl(s)}/submit`, { selected: [1] });
  await api(stu).post(`/sessions/${s.id}/finish`);
  const hidden = await api(stu).get(`/sessions/${s.id}/results`);
  assert.equal(hidden.status, 403);
  assert.equal(hidden.body.code, 'RESULTS_NOT_RELEASED');
  assert.equal((await api(lecA).put(`/${a._id}`, { releaseResults: true })).status, 200);
  const shown = await api(stu).get(`/sessions/${s.id}/results`);
  assert.equal(shown.status, 200);
  const row = shown.body.results.find((r) => r.questionId === String(qMcq._id));
  assert.equal(row.score, 100);
  assert.equal(shown.body.results.find((r) => r.questionId === String(qCode._id)).answered, false);
});

test('variants: each student gets a deterministic member of the group, frozen in the session', async () => {
  const group = 'g1';
  const m1 = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'V1', options: ['a', 'b'], correct: [0], variantGroup: group });
  const m2 = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'V2', options: ['a', 'b'], correct: [0], variantGroup: group });
  const m3 = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'V3', options: ['a', 'b'], correct: [0], variantGroup: group });
  const a = base({ questionIds: [m1._id], attemptsAllowed: 3, shuffleQuestions: false });
  const users = [stu, stu2];
  for (let i = 0; i < 8; i += 1) {
    const u = w.addUser({ email: `v${i}@a.edu`, institutionId: IDS.instA });
    w.enrollments.push({ institutionId: IDS.instA, userId: u._id, kind: 'student', courseId: courseA._id, cohortId: cohortA._id });
    users.push(u);
  }
  const chosen = {};
  for (const u of users) {
    const s1 = await start(a, u);
    chosen[u._id] = s1.questions[0].questionId;
    await api(u).post(`/sessions/${s1.id}/finish`);
    const s2 = await start(a, u); // second attempt: same variant
    assert.equal(s2.questions[0].questionId, chosen[u._id]);
    assert.ok([m1, m2, m3].map((m) => String(m._id)).includes(chosen[u._id]));
  }
  assert.ok(new Set(Object.values(chosen)).size > 1, 'students should not all get the same variant');
  // the other university's member of the same group is never handed out
  const foreign = db.addQuestion({ institutionId: IDS.instB, type: 'mcq', title: 'Foreign', options: ['a'], correct: [0], variantGroup: group });
  const again = await api(w.addUser({ email: 'late@a.edu', institutionId: IDS.instA })).post(`/${a._id}/start`);
  assert.equal(again.status, 404); // not enrolled, and
  assert.ok(!Object.values(chosen).includes(String(foreign._id)));
});

test('question order is shuffled per student and stable for the same student', async () => {
  const qs = [];
  for (let i = 0; i < 8; i += 1) qs.push(db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: `Q${i}`, options: ['a', 'b'], correct: [0] }));
  const a = base({ questionIds: qs.map((q) => q._id), attemptsAllowed: 2 });
  const s1 = await start(a, stu);
  const s2 = await start(a, stu2);
  const order = (s) => s.questions.map((q) => q.title).join(',');
  assert.notEqual(order(s1), order(s2));
  assert.equal(new Set(s1.questions.map((q) => q.questionId)).size, 8);
  await api(stu).post(`/sessions/${s1.id}/finish`);
  assert.equal(order(await start(a, stu)), order(s1));
});

// ---------------------------------------------------------------- practice mode lock
test('practice mode cannot be used to answer a question that is in an unfinished assessment', async () => {
  const a = base();
  const practice = (p) => request(app).get(`/api/practice${p}`).set(as(stu));
  assert.equal((await practice(`/questions/${qMcq._id}`)).status, 200);
  const s = await start(a);
  assert.equal((await practice(`/questions/${qMcq._id}`)).status, 409);
  assert.equal((await practice(`/questions/${qMcq._id}`)).body.code, 'ASSESSMENT_IN_PROGRESS');
  const submit = await request(app).post(`/api/practice/questions/${qMcq._id}/submit`).set(as(stu)).send({ selected: [1] });
  assert.equal(submit.status, 409);
  const ids = (await practice('/questions')).body.questions.map((x) => x.id);
  assert.ok(!ids.includes(String(qMcq._id)) && !ids.includes(String(qCode._id)));
  assert.equal((await request(app).get(`/api/practice/questions/${qMcq._id}`).set(as(stu2))).status, 200); // others unaffected
  await api(lecA).patch(`/${a._id}/status`, { status: 'closed' });
  assert.equal((await practice(`/questions/${qMcq._id}`)).status, 200);
  assert.ok(s);
});

test('autosave and edit events in assessment mode are stored against the session', async () => {
  const a = base();
  const s = await start(a);
  assert.equal((await api(stu).put(`${mcqUrl(s, qCode)}/autosave`, { language: 'javascript', source: 'abc' })).status, 200);
  assert.equal((await api(stu).put(`${mcqUrl(s, qCode)}/autosave`, { language: 'cobol', source: 'abc' })).status, 400);
  const ev = await api(stu).post(`${mcqUrl(s, qCode)}/events`, { seq: 1, events: [{ t: 10, type: 'insert', len: 1, pos: 0, text: 'a' }] });
  assert.equal(ev.status, 201);
  assert.equal(w.qdb.batches[0].assessmentSessionId, w.adb.sessions[0]._id);
  const q = await api(stu).get(mcqUrl(s, qCode));
  assert.equal(q.body.draft.source, 'abc');
  // the practice draft is separate
  const practiceDraft = await request(app).get(`/api/practice/questions/${qCode._id}/draft`).set(as(stu));
  assert.equal(practiceDraft.status, 409);
});
