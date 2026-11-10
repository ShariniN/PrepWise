// Student practice API: tenancy, no leaking of hidden data, server-side scoring, outage behaviour, autosave and events.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import app from '../app.js';

const REF_MARKER = 'REFSOL_MARKER_9d2';
const HIDDEN_IN = '98765';
const HIDDEN_OUT = '197530';
const HIDDEN_IN2 = '-4321';
const HIDDEN_OUT2 = '-8642';

const DOUBLE = `// ${REF_MARKER}\nconst n = parseInt(require('fs').readFileSync(0,'utf8').trim(), 10);\nconsole.log(n * 2);`;
const WRONG = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\nconsole.log(n + n + 1);';
const HALF_RIGHT = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\nconsole.log(n > 0 ? n * 2 : 0);';

let w, db, provider, stuA, stuA2, stuB, lecA, qA, qB, seed;
beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  provider = new VmProvider();
  exec.resetCache();
  exec.setProvider(provider);
  stuA = w.addUser({ email: 's1@a.edu', institutionId: IDS.instA });
  stuA2 = w.addUser({ email: 's2@a.edu', institutionId: IDS.instA });
  stuB = w.addUser({ email: 's@b.edu', institutionId: IDS.instB });
  lecA = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  const tests = [
    { input: '3', expectedOutput: '6', visible: true },
    { input: HIDDEN_IN, expectedOutput: HIDDEN_OUT, visible: false, weight: 2 },
    { input: HIDDEN_IN2, expectedOutput: HIDDEN_OUT2, visible: false, weight: 1 },
  ];
  qA = db.addQuestion({ institutionId: IDS.instA, title: 'Double A', referenceSolution: { language: 'javascript', source: DOUBLE }, wrongSolution: { language: 'javascript', source: WRONG }, explanation: 'EXPLAIN_SECRET' }, tests.map((t) => ({ ...t, institutionId: IDS.instA })));
  qB = db.addQuestion({ institutionId: IDS.instB, title: 'Double B', referenceSolution: { language: 'javascript', source: DOUBLE } }, tests.map((t) => ({ ...t, institutionId: IDS.instB })));
  seed = db.addQuestion({ institutionId: null, source: 'seed', slug: 'seed-double', title: 'Seed double', referenceSolution: { language: 'javascript', source: DOUBLE } }, tests);
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

const as = (u) => ({ Cookie: w.cookie(u) });
const api = (u) => ({
  get: (p) => request(app).get(`/api/practice${p}`).set(as(u)),
  post: (p, b) => request(app).post(`/api/practice${p}`).set(as(u)).send(b),
  put: (p, b) => request(app).put(`/api/practice${p}`).set(as(u)).send(b),
});
const assertNoSecrets = (res, extra = []) => {
  const text = JSON.stringify(res.body);
  for (const s of [REF_MARKER, HIDDEN_IN, HIDDEN_OUT, HIDDEN_IN2, HIDDEN_OUT2, 'EXPLAIN_SECRET', 'referenceSolution', 'wrongSolution', ...extra]) {
    assert.ok(!text.includes(s), `response leaked "${s}": ${text.slice(0, 300)}`);
  }
};

test('only students use the practice API', async () => {
  assert.equal((await request(app).get('/api/practice/questions')).status, 401);
  assert.equal((await request(app).get('/api/practice/questions').set(as(lecA))).status, 403);
});

test('tenant isolation: another university\'s questions are invisible, seed bank is shared', async () => {
  const list = await api(stuA).get('/questions');
  assert.equal(list.status, 200);
  const titles = list.body.questions.map((x) => x.title).sort();
  assert.deepEqual(titles, ['Double A', 'Seed double']);
  assert.equal((await api(stuA).get(`/questions/${qB._id}`)).status, 404);
  assert.equal((await api(stuA).post(`/questions/${qB._id}/submit`, { language: 'javascript', source: DOUBLE })).status, 404);
  assert.equal((await api(stuB).get(`/questions/${qA._id}`)).status, 404);
  assert.equal((await api(stuB).get(`/questions/${seed._id}`)).status, 200);
  assert.equal((await api(stuA).get(`/questions/${seed._id}`)).status, 200);
});

test('unpublished questions are hidden from students', async () => {
  const draft = db.addQuestion({ institutionId: IDS.instA, status: 'draft', title: 'Draft' });
  assert.equal((await api(stuA).get(`/questions/${draft._id}`)).status, 404);
  assert.ok(!(await api(stuA).get('/questions')).body.questions.some((x) => x.title === 'Draft'));
});

test('list filters and ?unseen=1 hides solved questions', async () => {
  db.addQuestion({ institutionId: IDS.instA, title: 'Hard sort', difficulty: 'hard', topic: ['sorting'] });
  assert.deepEqual((await api(stuA).get('/questions?difficulty=hard')).body.questions.map((x) => x.title), ['Hard sort']);
  assert.deepEqual((await api(stuA).get('/questions?topic=sorting')).body.questions.map((x) => x.title), ['Hard sort']);
  await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: DOUBLE });
  const unseen = (await api(stuA).get('/questions?unseen=1')).body.questions.map((x) => x.title);
  assert.ok(!unseen.includes('Double A') && unseen.includes('Hard sort'));
  const other = (await api(stuA2).get('/questions?unseen=1')).body.questions.map((x) => x.title);
  assert.ok(other.includes('Double A'));
});

test('question detail shows visible tests only and never solutions or hidden test data', async () => {
  const res = await api(stuA).get(`/questions/${qA._id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.question.visibleTests.map((t) => [t.input, t.expectedOutput]), [['3', '6']]);
  assert.equal(res.body.question.hiddenTestCount, 2);
  assertNoSecrets(res);
  assertNoSecrets(await api(stuA).get('/questions'));
});

test('run: visible tests show full detail, nothing hidden is run or returned', async () => {
  const res = await api(stuA).post(`/questions/${qA._id}/run`, { language: 'javascript', source: DOUBLE });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.verdict, 'accepted');
  assert.equal(res.body.tests.length, 1);
  assert.equal(res.body.tests[0].actualOutput, '6\n');
  assertNoSecrets(res);
  const bad = await api(stuA).post(`/questions/${qA._id}/run`, { language: 'javascript', source: WRONG });
  assert.equal(bad.body.verdict, 'wrong_answer');
});

test('run with custom stdin returns the raw run and records no score', async () => {
  const res = await api(stuA).post(`/questions/${qA._id}/run`, { language: 'javascript', source: DOUBLE, stdin: '21' });
  assert.equal(res.body.mode, 'custom');
  assert.equal(res.body.stdout, '42\n');
  assert.equal(db.attempts.at(-1).score, null);
  assert.equal(db.attempts.at(-1).runKind, 'run');
});

test('submit: weighted score, per-test pass/fail, hidden tests expose no data, attempt stored', async () => {
  const res = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: HALF_RIGHT });
  assert.equal(res.status, 200, res.text);
  // weights: visible 1 (pass), hidden 2 (pass), hidden 1 (fail) -> 3 of 4
  assert.equal(res.body.score, 75);
  assert.equal(res.body.verdict, 'wrong_answer');
  assert.deepEqual(res.body.tests.map((t) => [t.visible, t.passed]), [[true, true], [false, true], [false, false]]);
  for (const t of res.body.tests.filter((x) => !x.visible)) {
    assert.deepEqual(Object.keys(t).sort(), ['index', 'passed', 'timeMs', 'verdict', 'visible']);
  }
  assertNoSecrets(res);
  const stored = db.attempts.find((a) => a.runKind === 'submit');
  assert.equal(stored.score, 75);
  assert.equal(stored.questionVersion, 1);
  assert.equal(String(stored.userId), String(stuA._id));
  assert.equal(String(stored.institutionId), IDS.instA);
  assertNoSecrets({ body: stored });
  const ok = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: DOUBLE });
  assert.equal(ok.body.verdict, 'accepted');
  assert.equal(ok.body.score, 100);
});

test('client-supplied execution results and scores are ignored', async () => {
  const res = await api(stuA).post(`/questions/${qA._id}/submit`, {
    language: 'javascript', source: WRONG, verdict: 'accepted', score: 100, passed: 3,
    executionResults: { success: true }, tests: [{ passed: true }], perTest: [{ passed: true }],
  });
  assert.equal(res.body.verdict, 'wrong_answer');
  assert.equal(res.body.score, 0);
  assert.equal(db.attempts.at(-1).score, 0);
});

test('sandbox outage: 503 "unavailable" and no score or attempt is recorded', async () => {
  provider.down = true;
  const before = db.attempts.length;
  const sub = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: DOUBLE });
  assert.equal(sub.status, 503);
  assert.equal(sub.body.verdict, 'unavailable');
  assert.equal(sub.body.score, undefined);
  const run = await api(stuA).post(`/questions/${qA._id}/run`, { language: 'javascript', source: DOUBLE });
  assert.equal(run.status, 503);
  assert.equal(db.attempts.length, before);
});

test('runtime errors, timeouts and compile errors give honest verdicts', async () => {
  const rt = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: 'throw new Error("x")' });
  assert.equal(rt.body.verdict, 'runtime_error');
  const ce = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: 'let = ;' });
  assert.equal(ce.body.verdict, 'compile_error');
  const tl = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: 'while(true){}' });
  assert.equal(tl.body.verdict, 'time_limit');
  assertNoSecrets(tl);
});

test('input validation: language, size and question language list', async () => {
  assert.equal((await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'cobol', source: 'x' })).status, 400);
  assert.equal((await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'python', source: 'print(1)' })).status, 400); // not in question.languages
  assert.equal((await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript' })).status, 400);
  assert.equal((await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: 'x'.repeat(70000) })).status, 413);
  assert.equal((await api(stuA).post('/questions/not-an-id/submit', {})).status, 404);
});

test('mcq: marked server-side, correct answers never in the question, explanation only after submitting', async () => {
  const mcq = db.addQuestion({ institutionId: null, source: 'seed', type: 'mcq', title: 'Pick', options: ['a', 'b', 'c'], correct: [1], explanation: 'EXPLAIN_SECRET' });
  const get = await api(stuA).get(`/questions/${mcq._id}`);
  assert.deepEqual(get.body.question.options, ['a', 'b', 'c']);
  assert.ok(!JSON.stringify(get.body).includes('correct'));
  assert.ok(!JSON.stringify(get.body).includes('EXPLAIN_SECRET'));
  const bad = await api(stuA).post(`/questions/${mcq._id}/submit`, { selected: [0] });
  assert.equal(bad.body.verdict, 'wrong_answer');
  const good = await api(stuA).post(`/questions/${mcq._id}/submit`, { selected: [1] });
  assert.equal(good.body.score, 100);
  assert.equal(good.body.explanation, 'EXPLAIN_SECRET');
  assert.equal((await api(stuA).post(`/questions/${mcq._id}/submit`, { selected: [9] })).status, 400);
});

test('trace questions are marked server-side and the answer is never sent', async () => {
  const tq = db.addQuestion({ institutionId: null, source: 'seed', type: 'trace', title: 'Trace', traceAnswer: '1 2 3', explanation: 'because' });
  assert.ok(!JSON.stringify((await api(stuA).get(`/questions/${tq._id}`)).body).includes('1 2 3'));
  assert.equal((await api(stuA).post(`/questions/${tq._id}/submit`, { answer: '1 2 4' })).body.verdict, 'wrong_answer');
  assert.equal((await api(stuA).post(`/questions/${tq._id}/submit`, { answer: ' 1 2 3 \n' })).body.verdict, 'accepted');
});

test('short answers are stored for review, not scored', async () => {
  const sq = db.addQuestion({ institutionId: IDS.instA, type: 'short', title: 'Why?' });
  const res = await api(stuA).post(`/questions/${sq._id}/submit`, { answer: 'Because.' });
  assert.equal(res.body.verdict, 'pending_review');
  assert.equal(db.attempts.at(-1).needsReview, true);
  assert.equal(db.attempts.at(-1).score, null);
});

test('draft + autosave: one draft per student per question, private to the student and university', async () => {
  const start = await api(stuA).post(`/questions/${qA._id}/attempts`, {});
  assert.equal(start.status, 200);
  const id = start.body.draft.attemptId;
  assert.equal((await api(stuA).post(`/questions/${qA._id}/attempts`, {})).body.draft.attemptId, id);
  const saved = await api(stuA).put(`/attempts/${id}/autosave`, { language: 'javascript', source: 'let x = 1;' });
  assert.equal(saved.status, 200);
  const draft = await api(stuA).get(`/questions/${qA._id}/draft`);
  assert.equal(draft.body.draft.source, 'let x = 1;');
  assert.equal((await api(stuA2).get(`/questions/${qA._id}/draft`)).body.draft, null);
  assert.equal((await api(stuA2).put(`/attempts/${id}/autosave`, { language: 'javascript', source: 'hijack' })).status, 404);
  assert.equal((await api(stuB).put(`/attempts/${id}/autosave`, { language: 'javascript', source: 'hijack' })).status, 404);
  assert.equal((await api(stuA).get(`/questions/${qA._id}/draft`)).body.draft.source, 'let x = 1;');
  // a submit attempt is not an autosave target
  const sub = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: DOUBLE });
  assert.equal((await api(stuA).put(`/attempts/${sub.body.attemptId}/autosave`, { language: 'javascript', source: 'x' })).status, 404);
  assert.equal((await api(stuA).put(`/attempts/${id}/autosave`, { language: 'javascript', source: 'x'.repeat(70000) })).status, 400);
});

test('edit events: size caps, validation, and institution/user scoping', async () => {
  const id = (await api(stuA).post(`/questions/${qA._id}/attempts`, {})).body.draft.attemptId;
  const ev = (n) => Array.from({ length: n }, (_, i) => ({ t: i, type: 'insert', len: 1, pos: i, text: 'a' }));
  const ok = await api(stuA).post(`/attempts/${id}/events`, { events: ev(10), seq: 1 });
  assert.equal(ok.status, 201);
  assert.equal(db.batches.length, 1);
  assert.equal(String(db.batches[0].institutionId), IDS.instA);
  assert.equal((await api(stuA).post(`/attempts/${id}/events`, { events: ev(501) })).status, 413);
  const fat = Array.from({ length: 100 }, (_, i) => ({ t: i, type: 'paste', len: 1, text: 'z'.repeat(2000) }));
  assert.equal((await api(stuA).post(`/attempts/${id}/events`, { events: fat })).status, 413);
  assert.equal((await api(stuA).post(`/attempts/${id}/events`, { events: [{ t: 1, type: 'explode' }] })).status, 400);
  assert.equal((await api(stuA).post(`/attempts/${id}/events`, { events: [] })).status, 400);
  assert.equal((await api(stuA2).post(`/attempts/${id}/events`, { events: ev(1) })).status, 404);
  assert.equal((await api(stuB).post(`/attempts/${id}/events`, { events: ev(1) })).status, 404);
  const long = await api(stuA).post(`/attempts/${id}/events`, { events: [{ t: 1, type: 'paste', len: 5, text: 'q'.repeat(5000) }] });
  assert.equal(long.status, 201);
  assert.equal(db.batches.at(-1).events[0].text.length, 2000);
  assert.equal(db.batches.length, 2);
});

// QA-13: the student is told why the sandbox is unavailable (a friendly version of the real reason).
test('sandbox outage: the reason reaches the student in plain words', async () => {
  provider.down = 'quota';
  const sub = await api(stuA).post(`/questions/${qA._id}/submit`, { language: 'javascript', source: DOUBLE });
  assert.equal(sub.status, 503);
  assert.equal(sub.body.reason, 'quota');
  assert.match(sub.body.message, /Code execution limit for today has been reached/);
  assert.match(sub.body.message, /Nothing was scored/);
  provider.down = 'network';
  const run = await api(stuA).post(`/questions/${qA._id}/run`, { language: 'javascript', source: DOUBLE });
  assert.equal(run.body.reason, 'network');
  assert.match(run.body.message, /could not be reached/);
  assert.doesNotMatch(run.body.message, /down for test/, 'internal details are not passed through');
});

test('sandbox outage on /api/code/execute also gives the friendly reason', async () => {
  provider.down = 'quota';
  const res = await request(app).post('/api/code/execute').set(as(stuA)).send({ language: 'javascript', script: 'console.log(1)' });
  assert.equal(res.status, 503);
  assert.equal(res.body.reason, 'quota');
  assert.match(res.body.error, /limit for today/);
});
