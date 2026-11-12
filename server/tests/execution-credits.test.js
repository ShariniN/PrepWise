// Runner credits: every provider call is one credit on JDoodle (one program per request). These tests count the
// calls a stub provider receives, and check that the savings never make a result less honest.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import { verifyCodeServerSide } from '../modules/interviews/interviews.execution.js';
import app from '../app.js';

const READ = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\n';
const RIGHT = `${READ}console.log(n * 2);`;
const WRONG = `${READ}console.log(n * 2 + 1);`; // fails every test
const HIDDEN_WRONG = `${READ}console.log(n < 5 ? n * 2 : 0);`; // passes the visible tests (1, 2), fails hidden 5 and 6
const HIDDEN_SECRET = '777001';

// A provider that runs `okCalls` programs and then reports the daily quota as exhausted.
class QuotaAfter extends VmProvider {
  constructor(okCalls) { super(); this.okCalls = okCalls; }
  async run(req) {
    if (this.calls >= this.okCalls) this.down = 'quota';
    return super.run(req);
  }
}

let w, db, provider, stu, lec, q;
// 6 tests, 2 visible, interleaved so ordering bugs show up: v(1) h(3) v(2) h(4) h(5) h(6)
const SIX = [[1, true], [3, false], [2, true], [4, false], [5, false], [6, false]]
  .map(([n, visible]) => ({ input: String(n), expectedOutput: String(n * 2), visible }));

beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  provider = new VmProvider();
  exec.resetCache();
  exec.setProvider(provider);
  stu = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  lec = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  q = db.addQuestion({ institutionId: IDS.instA, title: 'Six tests' }, SIX.map((t) => ({ ...t, institutionId: IDS.instA })));
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

const submit = (source, u = stu) => request(app).post(`/api/practice/questions/${q._id}/submit`).set('Cookie', w.cookie(u)).send({ language: 'javascript', source });

test('submit that passes: every test runs once (6 credits, same as before)', async () => {
  const res = await submit(RIGHT);
  assert.equal(res.status, 200, res.text);
  assert.equal(provider.calls, 6);
  assert.equal(res.body.verdict, 'accepted');
  assert.equal(res.body.score, 100);
  assert.equal(res.body.notRun, 0);
  assert.equal(res.body.message, undefined);
});

test('submit that fails a visible test: hidden tests are not run (2 credits instead of 6) and are reported honestly', async () => {
  const res = await submit(WRONG);
  assert.equal(res.status, 200, res.text);
  assert.equal(provider.calls, 2, 'only the visible tests run');
  assert.equal(res.body.verdict, 'wrong_answer');
  assert.equal(res.body.score, 0);
  assert.equal(res.body.passed, 0);
  assert.equal(res.body.total, 6);
  assert.equal(res.body.notRun, 4);
  assert.match(res.body.message, /visible test failed, so the 4 hidden tests were not run and count as not passed/);
  // order is kept; hidden tests say not_run and still carry no data
  assert.deepEqual(res.body.tests.map((t) => [t.index, t.visible, t.passed, t.verdict]), [
    [1, true, false, 'wrong_answer'], [2, false, false, 'not_run'], [3, true, false, 'wrong_answer'],
    [4, false, false, 'not_run'], [5, false, false, 'not_run'], [6, false, false, 'not_run'],
  ]);
  for (const t of res.body.tests.filter((x) => !x.visible)) {
    assert.deepEqual(Object.keys(t).sort(), ['index', 'passed', 'timeMs', 'verdict', 'visible']);
    assert.equal(t.timeMs, null);
  }
  // what is stored (and what lecturer analytics read) says the same thing: hidden tests not run, not passed
  const stored = db.attempts.find((a) => a.runKind === 'submit');
  assert.equal(stored.verdict, 'wrong_answer');
  assert.equal(stored.score, 0);
  assert.deepEqual(stored.perTest.map((t) => [t.visible, t.passed, t.verdict]), [
    [true, false, 'wrong_answer'], [false, false, 'not_run'], [true, false, 'wrong_answer'],
    [false, false, 'not_run'], [false, false, 'not_run'], [false, false, 'not_run'],
  ]);
});

test('a skipped hidden test scores as not passed: one visible pass out of six equal weights is 17', async () => {
  const res = await submit(`${READ}console.log(n === 1 ? 2 : 0);`);
  assert.equal(provider.calls, 2);
  assert.equal(res.body.score, 17);
  assert.equal(res.body.passed, 1);
  assert.equal(res.body.verdict, 'wrong_answer');
});

test('visible tests pass but hidden ones fail: all hidden tests still run (no early stop), so the partial score is accurate', async () => {
  const res = await submit(HIDDEN_WRONG);
  assert.equal(provider.calls, 6);
  assert.equal(res.body.notRun, 0);
  assert.equal(res.body.score, 67); // 4 of 6
  assert.deepEqual(res.body.tests.map((t) => t.passed), [true, true, true, true, false, false]);
});

test('a runtime error on a visible test also skips the hidden tests and keeps the honest verdict', async () => {
  const res = await submit('throw new Error("boom")');
  assert.equal(provider.calls, 2);
  assert.equal(res.body.verdict, 'runtime_error');
  assert.equal(res.body.notRun, 4);
});

test('questions without hidden tests, or without visible tests, run every test as before', async () => {
  const allVisible = db.addQuestion({ institutionId: IDS.instA, title: 'All visible' }, SIX.slice(0, 3).map((t) => ({ ...t, visible: true, institutionId: IDS.instA })));
  const allHidden = db.addQuestion({ institutionId: IDS.instA, title: 'All hidden' }, SIX.slice(0, 3).map((t) => ({ ...t, visible: false, institutionId: IDS.instA })));
  for (const qq of [allVisible, allHidden]) {
    exec.resetCache(); provider.calls = 0;
    const res = await request(app).post(`/api/practice/questions/${qq._id}/submit`).set('Cookie', w.cookie(stu)).send({ language: 'javascript', source: WRONG });
    assert.equal(res.status, 200, res.text);
    assert.equal(provider.calls, 3);
    assert.equal(res.body.notRun, 0);
  }
});

test('runner out of credits while running the hidden tests: 503 with the reason, nothing stored', async () => {
  provider = new QuotaAfter(2); // the 2 visible tests run, then the quota is gone
  exec.setProvider(provider);
  const before = db.attempts.length;
  const res = await submit(RIGHT);
  assert.equal(res.status, 503);
  assert.equal(res.body.verdict, 'unavailable');
  assert.equal(res.body.reason, 'quota');
  assert.match(res.body.message, /limit for today has been reached.*Nothing was scored/);
  assert.equal(res.body.score, undefined);
  assert.equal(db.attempts.length, before);
});

test('runner unavailable before anything runs: 503 with the reason, nothing stored', async () => {
  provider.down = 'network';
  const res = await submit(WRONG);
  assert.equal(res.status, 503);
  assert.equal(res.body.reason, 'network');
  assert.equal(db.attempts.filter((a) => a.runKind === 'submit').length, 0);
});

test('interview answers: tests there have no visible/hidden split, so every test runs (N credits); no tests is 1 credit', async () => {
  const question = { tests: SIX.map(({ input, expectedOutput }) => ({ input, expectedOutput })) };
  const wrong = await verifyCodeServerSide({ question, code: WRONG, language: 'javascript' });
  assert.equal(provider.calls, 6);
  assert.equal(wrong.executionResults.testsPassed, 0);
  assert.equal(wrong.executionResults.testsTotal, 6);
  exec.resetCache(); provider.calls = 0;
  const free = await verifyCodeServerSide({ question: {}, code: 'console.log(1)', language: 'javascript' });
  assert.equal(provider.calls, 1);
  assert.equal(free.executionResults.verdict, 'accepted');
  provider.down = 'quota';
  exec.resetCache();
  const down = await verifyCodeServerSide({ question, code: RIGHT, language: 'javascript' });
  assert.equal(down.executionSource, 'unavailable');
  assert.equal(down.executionResults.serverVerified, false);
});

test('browser Run record: no runner call, stored as an unverified run, client claims ignored, never solved or scored', async () => {
  const res = await request(app).post(`/api/practice/questions/${q._id}/browser-run`).set('Cookie', w.cookie(stu))
    .send({ language: 'javascript', source: RIGHT, verdict: 'accepted', score: 100, passed: 2, tests: [{ passed: true }], perTest: [{ passed: true }] });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.body, { success: true, recorded: true, verified: false });
  assert.equal(provider.calls, 0, 'nothing runs on the server');
  const a = db.attempts.at(-1);
  assert.equal(a.runKind, 'run');
  assert.equal(a.verdict, 'browser_unverified');
  assert.equal(a.score, null);
  assert.deepEqual(a.perTest, []);
  assert.equal(String(a.userId), String(stu._id));
  // not solved: ?unseen=1 still lists the question, and lecturer metrics count no submission or solve,
  // but the student does show as active
  const list = await request(app).get('/api/practice/questions?unseen=1').set('Cookie', w.cookie(stu));
  assert.ok(list.body.questions.some((x) => x.id === String(q._id)));
  const { practiceSummary, studentRow } = await import('../modules/dashboard/dashboard.metrics.js');
  const summary = practiceSummary(db.attempts);
  assert.equal(summary.submissions, 0);
  assert.equal(summary.solved, 0);
  assert.equal(summary.averageScore, null);
  const row = studentRow({ _id: stu._id, name: 'S' }, { interviews: [], cvAnalyses: [], attempts: db.attempts }, new Date());
  assert.equal(row.practiceSolved, 0);
  assert.ok(row.lastActive, 'a browser run still counts as activity');
});

test('browser Run record: validated like a run (student only, published coding question, allowed language, source size)', async () => {
  const post = (id, body, u = stu) => request(app).post(`/api/practice/questions/${id}/browser-run`).set('Cookie', w.cookie(u)).send(body);
  assert.equal((await post(q._id, { language: 'javascript', source: RIGHT }, lec)).status, 403);
  assert.equal((await post(q._id, { language: 'python', source: 'print(1)' })).status, 400); // not in question.languages
  assert.equal((await post(q._id, { language: 'javascript', source: '' })).status, 400);
  assert.equal((await post(q._id, { language: 'javascript', source: 'x'.repeat(70000) })).status, 413);
  const mcq = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'M', options: ['a', 'b'], correct: [0] });
  assert.equal((await post(mcq._id, { language: 'javascript', source: RIGHT })).status, 400);
  const draft = db.addQuestion({ institutionId: IDS.instA, status: 'draft', title: 'D' });
  assert.equal((await post(draft._id, { language: 'javascript', source: RIGHT })).status, 404);
  assert.equal(db.attempts.length, 0);
  assert.equal(provider.calls, 0);
});

test('visible tests tell the browser which comparison the server uses', async () => {
  const cq = db.addQuestion({ institutionId: IDS.instA, title: 'Cmp' }, [
    { input: '1', expectedOutput: '2', visible: true, comparison: 'tokens', institutionId: IDS.instA },
    { input: '2', expectedOutput: '4', visible: true, institutionId: IDS.instA },
    { input: '3', expectedOutput: '6', visible: false, comparison: 'exact', institutionId: IDS.instA },
  ]);
  const res = await request(app).get(`/api/practice/questions/${cq._id}`).set('Cookie', w.cookie(stu));
  assert.deepEqual(res.body.question.visibleTests.map((t) => t.comparison), ['tokens', 'trim']);
  assert.equal(res.body.question.hiddenTestCount, 1);
});

test('hidden test data never leaks through the not-run path', async () => {
  const secretQ = db.addQuestion({ institutionId: IDS.instA, title: 'Secret' }, [
    { input: '1', expectedOutput: '2', visible: true, institutionId: IDS.instA },
    { input: HIDDEN_SECRET, expectedOutput: String(Number(HIDDEN_SECRET) * 2), visible: false, institutionId: IDS.instA },
  ]);
  const res = await request(app).post(`/api/practice/questions/${secretQ._id}/submit`).set('Cookie', w.cookie(stu)).send({ language: 'javascript', source: WRONG });
  assert.equal(res.body.notRun, 1);
  assert.match(res.body.message, /the 1 hidden test was not run and counts as not passed/);
  assert.ok(!JSON.stringify(res.body).includes(HIDDEN_SECRET));
});
