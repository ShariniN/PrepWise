const toPlain = (m) => (m instanceof Map ? Object.fromEntries(m) : (m || {}));
const idOf = (doc) => String(doc._id ?? doc.id);

// STUDENT view: a whitelist. A field that is not listed here can never reach a student by accident.
export const studentQuestion = (q, tests = []) => ({
  id: idOf(q),
  title: q.title,
  statement: q.statement,
  type: q.type,
  topic: q.topic || [],
  difficulty: q.difficulty,
  languages: q.languages || [],
  starterCode: toPlain(q.starterCode),
  timeLimitMs: q.timeLimitMs,
  memoryLimitKb: q.memoryLimitKb,
  estimatedMinutes: q.estimatedMinutes ?? null,
  learningOutcome: q.learningOutcome || '',
  version: q.version,
  isSeed: q.source === 'seed',
  ...(q.type === 'mcq' ? { options: q.options || [], multi: !!q.multi } : {}),
  // comparison lets the in-browser Run compare output exactly the way the server does
  visibleTests: tests.filter((t) => t.visible).map((t) => ({ id: idOf(t), input: t.input, expectedOutput: t.expectedOutput, comparison: t.comparison || 'trim' })),
  hiddenTestCount: tests.filter((t) => !t.visible).length,
});

export const studentListItem = (q) => ({
  id: idOf(q), title: q.title, type: q.type, topic: q.topic || [], difficulty: q.difficulty,
  languages: q.languages || [], estimatedMinutes: q.estimatedMinutes ?? null, isSeed: q.source === 'seed',
});

// Per-test results for a student. Visible tests show input, expected and actual output. Hidden tests show only
// pass/fail, verdict and time: never input, expected output, actual output or error text.
export const studentTestResults = (perTest, { detail }) => perTest.map((t, i) => (t.visible
  ? {
    index: i + 1, testId: t.testId, visible: true, passed: t.passed, verdict: t.verdict, timeMs: t.timeMs, memoryKb: t.memoryKb ?? null,
    ...(detail?.[t.testId] || {}),
  }
  : { index: i + 1, visible: false, passed: t.passed, verdict: t.verdict, timeMs: t.timeMs }));

// What is stored on an Attempt: no outputs for anything, no ids that would let hidden tests be probed.
export const storedPerTest = (perTest) => perTest.map((t) => ({
  testId: t.testId, visible: t.visible, passed: t.passed, timeMs: t.timeMs, verdict: t.verdict,
}));
