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
export const gradeTests = async ({ language, source, tests, limits }) => {
  const runs = await runMany(tests.map((t) => ({ language, source, stdin: t.input, limits })));
  const perTest = runs.map((r, i) => {
    const t = tests[i];
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
  });
  return { perTest, verdict: overallVerdict(perTest), score: scoreOf(perTest, tests) };
};
