// Runner credits: every provider call is one credit on JDoodle (one program per request). These tests count the
// calls a stub provider receives, and check that the savings never make a result less honest.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import { verifyCodeServerSide } from '../services/interviewExecution.js';
import app from '../app.js';

const READ = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\n';
const RIGHT = `${READ}console.log(n * 2);`;
const WRONG = `${READ}console.log(n * 2 + 1);`; // fails every test
const HIDDEN_WRONG = `${READ}console.log(n < 5 ? n * 2 : 0);`; // passes the visible tests (1, 2), fails hidden 5 and 6
const LAST_WRONG = `${READ}console.log(n === 6 ? 0 : n * 2);`; // fails only the last test
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
  q = db.addQuestion({ institutionId: IDS.instA, authorId: lec._id, title: 'Six tests' }, SIX.map((t) => ({ ...t, institutionId: IDS.instA })));
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

const submit = (source, u = stu) => request(app).post(`/api/practice/questions/${q._id}/submit`).set('Cookie', w.cookie(u)).send({ language: 'javascript', source });
const draftQuestion = (extra = {}) => db.addQuestion({
  institutionId: IDS.instA, authorId: lec._id, status: 'draft', title: 'Validate me',
  referenceSolution: { language: 'javascript', source: RIGHT }, wrongSolution: { language: 'javascript', source: WRONG }, ...extra,
}, SIX.map((t) => ({ ...t, institutionId: IDS.instA })));
const validate = (id, body = {}) => request(app).post(`/api/questions/${id}/validate`).set('Cookie', w.cookie(lec)).send(body);

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

test('validation: the reference runs every test, the wrong solution stops at its first failure (7 credits instead of 12)', async () => {
  const d = draftQuestion();
  const res = await validate(d._id);
  assert.equal(res.status, 200, res.text);
  assert.equal(provider.calls, 7);
  assert.equal(res.body.passed, true);
  assert.equal(res.body.referencePassed, true);
  assert.equal(res.body.reference.length, 6);
  assert.equal(res.body.wrongSolutionChecked, true);
  assert.equal(res.body.wrongSolutionFailed, true);
  assert.equal(res.body.wrong.length, 1, 'only the tests that ran are listed');
  assert.equal(res.body.wrongTestsRun, 1);
  assert.match(res.body.message, /failed test 1 of 6, so its remaining 5 tests were not run/);
  const stored = db.questions.find((x) => x._id === d._id).validation;
  assert.equal(stored.passed, true);
  assert.equal(stored.testsRun, 6);
});

test('validation: a wrong solution that only fails the last test is run on every test (12 credits) and still caught', async () => {
  const d = draftQuestion({ wrongSolution: { language: 'javascript', source: LAST_WRONG } });
  const res = await validate(d._id);
  assert.equal(provider.calls, 12);
  assert.equal(res.body.passed, true);
  assert.equal(res.body.wrong.length, 6);
  assert.doesNotMatch(res.body.message, /not run/);
});

test('validation: a wrong solution that passes every test still blocks publishing', async () => {
  const d = draftQuestion({ wrongSolution: { language: 'javascript', source: RIGHT } });
  const res = await validate(d._id);
  assert.equal(res.body.passed, false);
  assert.equal(res.body.wrongSolutionFailed, false);
  assert.match(res.body.message, /too weak/);
  // the reference and the "wrong" solution are the same program, so the cache answers the second run
  assert.equal(provider.calls, 6);
});

test('validation: when the reference fails, the wrong solution is not run at all (6 credits instead of 12)', async () => {
  const d = draftQuestion({ referenceSolution: { language: 'javascript', source: HIDDEN_WRONG } });
  const res = await validate(d._id);
  assert.equal(provider.calls, 6);
  assert.equal(res.body.passed, false);
  assert.equal(res.body.referencePassed, false);
  assert.equal(res.body.wrongSolutionChecked, false);
  assert.equal(res.body.wrongSolutionFailed, null);
  assert.equal(res.body.wrong, undefined);
  assert.match(res.body.message, /reference solution fails some tests.*wrong solution was not run/);
});

test('validation out of credits halfway: 503 with the reason and nothing recorded', async () => {
  provider = new QuotaAfter(6); // the reference runs, then the quota is gone before the wrong solution
  exec.setProvider(provider);
  const d = draftQuestion();
  const res = await validate(d._id);
  assert.equal(res.status, 503);
  assert.equal(res.body.reason, 'quota');
  assert.equal(db.questions.find((x) => x._id === d._id).validation, undefined);
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
