// Code replay: pure reconstruction and the staff endpoint.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { reconstructReplay, REPLAY_LIMITS } from '../services/integrity/replay.js';
import app from '../app.js';

// Applies a replay's states the way a player would and returns the final document.
const play = (states) => {
  let doc = '';
  for (const s of states) {
    if (s.patch) doc = doc.slice(0, s.patch.pos) + doc.slice(s.patch.pos + s.patch.del) ;
    if (s.patch) doc = doc.slice(0, s.patch.pos) + s.patch.ins + doc.slice(s.patch.pos);
    if (s.text !== undefined) doc = s.text;
  }
  return doc;
};
// Same, but only trusting patches from the last full snapshot (what seeking does).
const typing = (text, startT = 0, startPos = 0) => [...text].map((ch, i) => ({ t: startT + i * 80, type: 'insert', len: 1, pos: startPos + i, text: ch }));

test('typing is coalesced and reconstructs the exact document', () => {
  const r = reconstructReplay([{ events: typing('function f() {}') }], { finalText: 'function f() {}' });
  assert.equal(r.matchesFinal, true);
  assert.equal(r.states.length, 2, 'start + one coalesced typing state');
  assert.equal(r.states[1].patch.ins, 'function f() {}');
  assert.equal(play(r.states), 'function f() {}');
});

test('deletes, backspaces and mid-document edits', () => {
  const events = [
    ...typing('hello world'),
    { t: 2000, type: 'delete', len: 1, pos: 10 }, { t: 2050, type: 'delete', len: 1, pos: 9 }, { t: 2100, type: 'delete', len: 1, pos: 8 }, // backspace "rld"
    { t: 3000, type: 'insert', len: 5, pos: 6, text: 'brave' },
    { t: 4000, type: 'delete', len: 6, pos: 0 },
  ];
  const r = reconstructReplay([{ events }], { finalText: 'bravewo' });
  assert.equal(r.matchesFinal, true, JSON.stringify(r.states));
  assert.equal(play(r.states), 'bravewo');
});

test('pastes carry markers; large pastes and cut text are called out', () => {
  const big = 'x'.repeat(600);
  const events = [
    { t: 10, type: 'paste', len: 30, pos: 0, text: 'print("hello world from paste")' },
    { t: 20, type: 'paste', len: 600, pos: 0, text: big },
    { t: 30, type: 'paste', len: 5000, pos: 0, text: 'y'.repeat(2000) },
  ];
  const r = reconstructReplay([{ events }]);
  assert.deepEqual(r.states[1].markers, ['paste']);
  assert.deepEqual(r.states[2].markers, ['paste', 'large_paste']);
  assert.deepEqual(r.states[3].markers, ['truncated', 'paste', 'large_paste']);
});

test('focus and blur become marker states and do not change the text', () => {
  const r = reconstructReplay([{ events: [{ t: 5, type: 'blur' }, ...typing('ab', 100), { t: 900, type: 'focus' }] }], { finalText: 'ab' });
  assert.deepEqual(r.states.map((s) => s.markers[0]), ['start', 'blur', undefined, 'focus']);
  assert.equal(r.states[1].patch, null);
  assert.equal(r.matchesFinal, true);
});

test('starter code as the initial document', () => {
  const starter = 'def solve():\n    pass\n';
  const events = [{ t: 100, type: 'delete', len: 4, pos: 17 }, { t: 200, type: 'insert', len: 6, pos: 17, text: 'return' }];
  const r = reconstructReplay([{ events }], { initialText: starter, finalText: 'def solve():\n    return\n' });
  assert.equal(r.matchesFinal, true);
  assert.equal(r.states[0].text, starter);
  const wrong = reconstructReplay([{ events }], { initialText: '', finalText: 'def solve():\n    return\n' });
  assert.equal(wrong.matchesFinal, false);
});

test('missing text makes the replay approximate and the final submission is appended with a marker', () => {
  const r = reconstructReplay([{ events: [{ t: 1, type: 'insert', len: 3, pos: 0 }] }], { finalText: 'abc' });
  assert.equal(r.approximate, true);
  assert.equal(r.matchesFinal, false);
  assert.ok(r.states[1].markers.includes('approximate'));
  const last = r.states.at(-1);
  assert.equal(last.text, 'abc');
  assert.deepEqual(last.markers, ['final_submission', 'approximate']);
});

test('a page reload (time going backwards) keeps the timeline increasing and is marked', () => {
  const r = reconstructReplay([{ events: typing('ab', 0) }, { events: typing('cd', 0, 2) }], { finalText: 'abcd' });
  assert.equal(r.matchesFinal, true);
  const ts = r.states.map((s) => s.t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.ok(r.states.some((s) => s.markers.includes('editor_restarted')));
});

test('output is capped: states, characters and total size', () => {
  const noisy = Array.from({ length: 6000 }, (_, i) => ({ t: i * 2000, type: 'insert', len: 1, pos: 0, text: 'a' })); // not contiguous in time: no coalescing
  const r = reconstructReplay([{ events: noisy }], { finalText: null });
  assert.equal(r.truncated, 'max_states');
  assert.equal(r.states.length, REPLAY_LIMITS.maxStates);
  const huge = reconstructReplay([{ events: Array.from({ length: 400 }, (_, i) => ({ t: i * 10, type: 'paste', len: 2000, pos: 0, text: 'z'.repeat(2000) })) }]);
  assert.equal(huge.truncated, 'document_too_large');
  assert.ok(JSON.stringify(huge.states).length < REPLAY_LIMITS.outputBudget * 2.5);
  const budget = reconstructReplay([{ events: Array.from({ length: 60 }, (_, i) => ({ t: i * 5000, type: 'paste', len: 2000, pos: 0, text: String(i % 10).repeat(2000) })) }], { limits: { outputBudget: 50_000 } });
  assert.equal(budget.truncated, 'output_budget');
  assert.ok(budget.states.length < 60);
});

test('snapshots appear periodically so a player can seek, and they are correct', () => {
  const events = Array.from({ length: 130 }, (_, i) => ({ t: i * 3000, type: 'insert', len: 1, pos: i, text: String.fromCharCode(97 + (i % 26)) }));
  const r = reconstructReplay([{ events }]);
  const snaps = r.states.filter((s, i) => i > 0 && s.text !== undefined);
  assert.ok(snaps.length >= 2);
  let doc = '';
  r.states.forEach((s, i) => {
    if (s.patch) doc = doc.slice(0, s.patch.pos) + doc.slice(s.patch.pos + s.patch.del), doc = doc.slice(0, s.patch.pos) + s.patch.ins + doc.slice(s.patch.pos);
    if (i > 0 && s.text !== undefined) assert.equal(s.text, doc, `snapshot at state ${i}`);
  });
});

// ---------------------------------------------------------------- endpoint
let w, db, lecA, lecA2, lecB, stu, courseA, q, assessment, session;
beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  lecA = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  stu = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  courseA = { _id: newId(), institutionId: IDS.instA, code: 'CS1', title: 'CS1', ownerId: lecA._id };
  w.courses.push(courseA);
  q = db.addQuestion({ institutionId: IDS.instA, title: 'Q', starterCode: { python: 'def f():\n    pass\n' } });
  assessment = w.adb.addAssessment({ institutionId: IDS.instA, courseId: courseA._id, questionIds: [q._id] });
  session = {
    _id: newId(), institutionId: IDS.instA, assessmentId: assessment._id, courseId: courseA._id, userId: stu._id, status: 'submitted',
    serverStartedAt: new Date(Date.now() - 3600e3), baseDeadline: new Date(Date.now() + 1000), extensionMs: 0, closesAt: assessment.closesAt,
    questions: [{ questionId: q._id }], integrityLevel: 1, disabledSignals: [],
  };
  w.adb.sessions.push(session);
  const attempt = { _id: newId(), institutionId: IDS.instA, userId: stu._id, questionId: q._id, assessmentSessionId: session._id, runKind: 'submit', language: 'python', source: 'def f():\n    return 1\n', createdAt: new Date() };
  w.qdb.attempts.push(attempt);
  w.qdb.batches.push({
    _id: newId(), institutionId: IDS.instA, assessmentSessionId: session._id, questionId: q._id, attemptId: attempt._id, userId: stu._id, seq: 1, createdAt: new Date(),
    events: [{ t: 100, type: 'delete', len: 4, pos: 13 }, { t: 200, type: 'insert', len: 8, pos: 13, text: 'return 1' }],
  });
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

const as = (u) => ({ Cookie: w.cookie(u) });
const replay = (u, qs = `?questionId=${q._id}`, id = session._id) => request(app).get(`/api/integrity/sessions/${id}/replay${qs}`).set(as(u));

test('replay endpoint rebuilds the document, picks the starter code as the starting point and audits the view', async () => {
  const r = await replay(lecA);
  assert.equal(r.status, 200);
  assert.equal(r.body.initialSource, 'starter');
  assert.equal(r.body.matchesFinal, true);
  assert.equal(r.body.language, 'python');
  assert.equal(r.body.states[0].text, 'def f():\n    pass\n');
  assert.equal(r.body.states.length, 3);
  assert.equal(r.body.limits.maxStates, 2000);
  const a = w.audit.filter((x) => x.action === 'integrity.replay');
  assert.equal(a.length, 1);
  assert.equal(String(a[0].actor), String(lecA._id));
  assert.equal(a[0].meta.studentId, String(stu._id));
});

test('replay is staff only, tenant scoped and limited to the lecturer\'s courses', async () => {
  assert.equal((await request(app).get(`/api/integrity/sessions/${session._id}/replay?questionId=${q._id}`)).status, 401);
  assert.equal((await replay(stu)).status, 403);
  assert.equal((await replay(lecB)).status, 404);
  assert.equal((await replay(lecA2)).status, 404);
  assert.equal((await replay(lecA, `?questionId=${newId()}`)).status, 404);
  assert.equal((await replay(lecA, '')).status, 404);
  assert.equal((await replay(lecA, `?questionId=${q._id}`, 'zzz')).status, 404);
  assert.equal(w.audit.filter((x) => x.action === 'integrity.replay').length, 0);
});

test('no edit events: the replay says so instead of failing', async () => {
  w.qdb.batches.length = 0;
  const r = await replay(lecA);
  assert.equal(r.status, 200);
  assert.match(r.body.note, /No edit events/);
  assert.equal(r.body.matchesFinal, false);
  assert.equal(r.body.states.at(-1).markers[0], 'final_submission');
});
