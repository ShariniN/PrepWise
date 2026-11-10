// Turns raw sandbox runs into verdicts and scores. Only results produced here count towards marks.
import { runMany } from './execution/index.js';

const normalizeNewlines = (s) => String(s ?? '').replace(/\r\n?/g, '\n');

export const outputsMatch = (actual, expected, mode = 'trim') => {
  const a = normalizeNewlines(actual);
  const e = normalizeNewlines(expected);
  if (mode === 'exact') return a === e;
  if (mode === 'tokens') {
    const ta = a.split(/\s+/).filter(Boolean);
    const te = e.split(/\s+/).filter(Boolean);
    return ta.length === te.length && ta.every((t, i) => t === te[i]);
  }
  const lines = (s) => s.replace(/\s+$/, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  const la = lines(a);
  const le = lines(e);
  return la.length === le.length && la.every((l, i) => l === le[i]);
};

// `not_run` is deliberately absent: a skipped test never decides the overall verdict while a test that ran failed.
const FAILURE_ORDER = ['compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'wrong_answer'];

export const overallVerdict = (perTest) => {
  if (!perTest.length) return 'accepted';
  const failed = perTest.filter((t) => !t.passed);
  if (!failed.length) return 'accepted';
  for (const v of FAILURE_ORDER) if (failed.some((t) => t.verdict === v)) return v;
  return failed[0].verdict;
};

export const scoreOf = (perTest, tests) => {
  const weightOf = (id) => Number(tests.find((t) => String(t._id) === String(id))?.weight) || 1;
  const total = perTest.reduce((s, t) => s + weightOf(t.testId), 0);
  if (!total) return 0;
  const got = perTest.filter((t) => t.passed).reduce((s, t) => s + weightOf(t.testId), 0);
  return Math.round((got / total) * 100);
};

/**
 * Runs `tests` against the source in the sandbox. Returns full per-test detail (stdout etc.) for internal use;
 * callers must pass the result through a serializer before sending anything to a student.
 * Throws ExecutionUnavailableError if the sandbox is down; nothing partial is returned.
 */
const judge = (t, r) => {
  const ranOk = r.status === 'accepted';
  const matched = ranOk && outputsMatch(r.stdout, t.expectedOutput, t.comparison);
  return {
    testId: String(t._id),
    visible: !!t.visible,
    passed: matched,
    verdict: matched ? 'accepted' : (ranOk ? 'wrong_answer' : r.status),
    timeMs: r.timeMs ?? null,
    memoryKb: r.memoryKb ?? null,
    stdout: r.stdout,
    stderr: r.stderr,
    compileOutput: r.compileOutput,
  };
};

// A test that was deliberately not run. It counts as not passed and never carries output.
export const NOT_RUN = 'not_run';
const notRun = (t) => ({
  testId: String(t._id), visible: !!t.visible, passed: false, verdict: NOT_RUN, timeMs: null, memoryKb: null, stdout: '', stderr: '', compileOutput: '',
});

export const gradeTests = async ({ language, source, tests, limits }) => {
  const runs = await runMany(tests.map((t) => ({ language, source, stdin: t.input, limits })));
  const perTest = runs.map((r, i) => judge(tests[i], r));
  return { perTest, verdict: overallVerdict(perTest), score: scoreOf(perTest, tests) };
};

/**
 * Submit grading that saves runner credits: the visible tests run first, and the hidden tests run only when every
 * visible test passed (then all of them run, so a partial score stays accurate). When a visible test fails, each
 * hidden test is reported as `not_run` and scores as not passed. `perTest` keeps the order of `tests`.
 * Returns the gradeTests shape plus `notRun` (how many tests were skipped). Throws like gradeTests.
 */
export const gradeVisibleFirst = async ({ language, source, tests, limits }) => {
  const visible = tests.filter((t) => t.visible);
  const hidden = tests.filter((t) => !t.visible);
  if (!visible.length || !hidden.length) return { ...(await gradeTests({ language, source, tests, limits })), notRun: 0 };
  const first = (await gradeTests({ language, source, tests: visible, limits })).perTest;
  const visibleOk = first.every((t) => t.passed);
  const second = visibleOk ? (await gradeTests({ language, source, tests: hidden, limits })).perTest : hidden.map(notRun);
  const queues = { v: [...first], h: [...second] };
  const perTest = tests.map((t) => (t.visible ? queues.v.shift() : queues.h.shift()));
  return { perTest, verdict: overallVerdict(perTest), score: scoreOf(perTest, tests), notRun: visibleOk ? 0 : hidden.length };
};

/**
 * Runs tests one at a time, in order, and stops at the first one that does not pass. For checks that only need to
 * know whether some test fails (the lecturer's wrong solution). `perTest` holds only the tests that actually ran.
 */
export const gradeUntilFirstFailure = async ({ language, source, tests, limits }) => {
  const perTest = [];
  for (const t of tests) {
    const [r] = await runMany([{ language, source, stdin: t.input, limits }]);
    const p = judge(t, r);
    perTest.push(p);
    if (!p.passed) break;
  }
  return { perTest, failed: perTest.some((p) => !p.passed), notRun: tests.length - perTest.length };
};
