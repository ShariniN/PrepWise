// Level 1 integrity events: validation, tenancy, accommodations, technical labelling, and case creation on finish
// without any effect on marks.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import { buildTimeline } from '../services/integrity/timeline.js';
import Assessment from '../models/Assessment.js';
import AssessmentSession from '../models/AssessmentSession.js';
import IntegrityEvent from '../models/IntegrityEvent.js';
import ReviewCase from '../models/ReviewCase.js';
import app from '../app.js';

const HOUR = 3600e3;
let w, db, lecA, stu, stu2, stuB, lecB, courseA, cohortA, qMcq, a;
beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  exec.resetCache(); exec.setProvider(new VmProvider());
  lecA = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  stu = w.addUser({ email: 's1@a.edu', institutionId: IDS.instA });
  stu2 = w.addUser({ email: 's2@a.edu', institutionId: IDS.instA });
  stuB = w.addUser({ email: 's@b.edu', institutionId: IDS.instB });
  courseA = { _id: newId(), institutionId: IDS.instA, code: 'CS1', title: 'CS1', ownerId: lecA._id };
  cohortA = { _id: newId(), institutionId: IDS.instA, courseId: courseA._id, name: '2026' };
  w.courses.push(courseA); w.cohorts.push(cohortA);
  for (const u of [stu, stu2]) w.enrollments.push({ institutionId: IDS.instA, userId: u._id, kind: 'student', courseId: courseA._id, cohortId: cohortA._id });
  qMcq = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'Pick', options: ['a', 'b'], correct: [1] });
  a = w.adb.addAssessment({ institutionId: IDS.instA, courseId: courseA._id, cohortId: cohortA._id, createdBy: lecA._id, questionIds: [qMcq._id], integrityLevel: 1 });
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

const as = (u) => ({ Cookie: w.cookie(u) });
const api = (u) => ({
  get: (p) => request(app).get(`/api/assessments${p}`).set(as(u)),
  post: (p, b) => request(app).post(`/api/assessments${p}`).set(as(u)).send(b),
  put: (p, b) => request(app).put(`/api/assessments${p}`).set(as(u)).send(b),
});
const start = async (u = stu) => (await api(u).post(`/${a._id}/start`, {})).body.session;
const send = (u, s, events) => api(u).post(`/sessions/${s.id}/integrity-events`, { events });
const hiddenPairs = (count, secs = 20) => Array.from({ length: count }, (_, i) => [
  { type: 'tab_hidden', t: 60000 * (i + 1) }, { type: 'tab_visible', t: 60000 * (i + 1) + secs * 1000 },
]).flat();

test('events are validated, capped and belong to the student\'s own session', async () => {
  const s = await start();
  assert.equal((await request(app).post(`/api/assessments/sessions/${s.id}/integrity-events`).send({ events: [] })).status, 401);
  assert.equal((await send(lecA, s, [{ type: 'paste', t: 1 }])).status, 403);
  assert.equal((await send(stu2, s, [{ type: 'paste', t: 1 }])).status, 404);
  assert.equal((await send(stuB, s, [{ type: 'paste', t: 1 }])).status, 404);
  assert.equal((await send(stu, s, [])).status, 400);
  assert.equal((await send(stu, s, [{ type: 'keylogger', t: 1 }])).status, 400);
  assert.equal((await send(stu, s, [{ type: 'paste' }])).status, 400);
  assert.equal((await send(stu, s, [{ type: 'paste', t: 1, len: -5 }])).status, 400);
  assert.equal((await send(stu, s, [{ type: 'paste', t: 1, questionId: String(newId()) }])).status, 400);
  assert.equal((await send(stu, s, Array.from({ length: 101 }, (_, i) => ({ type: 'window_blur', t: i })))).status, 413);
  assert.equal((await send(stu, s, [{ type: 'window_blur', t: 1, detail: 'x'.repeat(20000) }])).status, 413);
  assert.equal(w.adb.events.length, 0);
});

test('every supported signal is stored; offline / online are labelled technical', async () => {
  const s = await start();
  const types = ['tab_hidden', 'tab_visible', 'window_blur', 'window_focus', 'fullscreen_exit', 'paste', 'copy', 'cut', 'contextmenu', 'devtools_hint', 'multiple_screens_hint', 'network_offline', 'network_online'];
  const r = await send(stu, s, types.map((type, i) => ({ type, t: i * 1000, ...(type === 'paste' ? { len: 1840, inEditor: true, questionId: String(qMcq._id) } : {}) })));
  assert.equal(r.status, 201);
  assert.equal(r.body.stored, 13);
  assert.deepEqual(w.adb.events.filter((e) => e.technical).map((e) => e.type), ['network_offline', 'network_online']);
  const paste = w.adb.events.find((e) => e.type === 'paste');
  assert.equal(paste.len, 1840);
  assert.equal(paste.inEditor, true);
  assert.equal(String(paste.userId), String(stu._id));
  assert.equal(String(paste.institutionId), IDS.instA);
});

test('integrity level 0 stores nothing; an accommodation can switch individual signals off', async () => {
  const off = w.adb.addAssessment({ institutionId: IDS.instA, courseId: courseA._id, cohortId: cohortA._id, questionIds: [qMcq._id], integrityLevel: 0 });
  const s0 = (await api(stu).post(`/${off._id}/start`, {})).body.session;
  assert.deepEqual(s0.signals, []);
  assert.equal((await send(stu, s0, [{ type: 'paste', t: 1, len: 5 }])).body.stored, 0);
  await api(lecA).put(`/${a._id}/accommodations/${stu._id}`, { disabledSignals: ['fullscreen_exit', 'tab_hidden'] });
  const s = await start();
  const r = await send(stu, s, [{ type: 'fullscreen_exit', t: 1 }, { type: 'tab_hidden', t: 2 }, { type: 'paste', t: 3, len: 4 }]);
  assert.equal(r.body.stored, 1);
  assert.equal(r.body.ignored, 2);
  assert.deepEqual(w.adb.events.map((e) => e.type), ['paste']);
});

test('events stop being accepted well after the session ended', async () => {
  const s = await start();
  w.adb.sessions[0].baseDeadline = new Date(Date.now() - 10 * 60 * 1000);
  const r = await send(stu, s, [{ type: 'tab_visible', t: 1 }]);
  assert.equal(r.status, 409);
});

test('finishing a session with enough evidence creates one open review case with reasons and evidence', async () => {
  const s = await start();
  await send(stu, s, [...hiddenPairs(6, 42), { type: 'paste', t: 843000, len: 1840, inEditor: true }]);
  const fin = await api(stu).post(`/sessions/${s.id}/finish`, {});
  assert.equal(fin.status, 200);
  assert.equal(w.adb.cases.length, 1);
  const c = w.adb.cases[0];
  assert.equal(c.status, 'open');
  assert.equal(String(c.userId), String(stu._id));
  assert.equal(String(c.courseId), String(courseA._id));
  const texts = c.reasons.map((r) => r.text);
  assert.ok(texts.includes('left the page 6 times for a total of 4m12s'), texts.join(' | '));
  assert.ok(texts.includes('pasted 1,840 characters in one event at 00:14:03'), texts.join(' | '));
  assert.ok(c.reasons.every((r) => r.evidence.length > 0 && r.threshold));
  // finishing again does not create a second case
  await api(stu).post(`/sessions/${s.id}/finish`, {});
  assert.equal(w.adb.cases.length, 1);
  // the student's response to finish does not mention integrity at all
  assert.ok(!JSON.stringify(fin.body).match(/case|reason|flag/i));
});

test('connection drops alone never create a case; they are summarised on the case if one exists', async () => {
  const s = await start();
  await send(stu, s, Array.from({ length: 12 }, (_, i) => ({ type: i % 2 ? 'network_online' : 'network_offline', t: 30000 * (i + 1) })));
  await api(stu).post(`/sessions/${s.id}/finish`, {});
  assert.equal(w.adb.cases.length, 0);
  const s2 = await start(stu2);
  await send(stu2, s2, [...hiddenPairs(6, 30), { type: 'network_offline', t: 1000 }, { type: 'network_online', t: 9000 }]);
  await api(stu2).post(`/sessions/${s2.id}/finish`, {});
  assert.equal(w.adb.cases[0].technical.offlineCount, 1);
  assert.ok(!w.adb.cases[0].reasons.some((r) => r.kind === 'technical'));
});

test('flagging never changes a mark: attempts keep their scores and no model has a penalty-like field', async () => {
  const s = await start();
  const sub = await api(stu).post(`/sessions/${s.id}/questions/${qMcq._id}/submit`, { selected: [1] });
  assert.equal(sub.status, 200);
  await send(stu, s, [...hiddenPairs(8, 60), { type: 'paste', t: 5000, len: 5000, inEditor: true }]);
  await api(stu).post(`/sessions/${s.id}/finish`, {});
  assert.equal(w.adb.cases.length, 1);
  assert.deepEqual(w.qdb.attempts.filter((x) => x.runKind === 'submit').map((x) => x.score), [100]);
  const FORBIDDEN = /score|penalt|deduct|grade|mark(?!er)|adjust|risk|verdict/i;
  for (const model of [ReviewCase, IntegrityEvent, AssessmentSession, Assessment]) {
    const paths = Object.keys(model.schema.paths).filter((p) => FORBIDDEN.test(p));
    assert.deepEqual(paths, [], `${model.modelName} has score-like fields: ${paths}`);
  }
  assert.ok(!Object.keys(w.adb.cases[0]).some((k) => FORBIDDEN.test(k)));
});

test('timeline for a session merges what the student did', async () => {
  const s = await start();
  await api(stu).put(`/sessions/${s.id}/questions/${qMcq._id}/autosave`, { language: 'javascript', source: 'x' });
  await api(stu).post(`/sessions/${s.id}/questions/${qMcq._id}/events`, { seq: 1, events: [{ t: 10, type: 'insert', len: 1, pos: 0, text: 'x' }] });
  await api(stu).post(`/sessions/${s.id}/questions/${qMcq._id}/submit`, { selected: [1] });
  await send(stu, s, [{ type: 'tab_hidden', t: 5000 }]);
  const t = await buildTimeline(s.id, IDS.instA);
  const kinds = t.items.map((i) => i.kind);
  assert.ok(['session', 'integrity', 'editing', 'attempt'].every((k) => kinds.includes(k)), kinds.join());
  assert.equal(await buildTimeline(s.id, IDS.instB), null); // other university cannot build it
});
