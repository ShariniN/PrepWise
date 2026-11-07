import crypto from 'node:crypto';

const toPlain = (m) => (m instanceof Map ? Object.fromEntries(m) : (m || {}));
const idOf = (doc) => String(doc._id ?? doc.id);

// Everything that defines what a question is. A validation is only valid for the content hash it ran against.
export const contentHash = (q, tests = []) => crypto.createHash('sha256').update(JSON.stringify({
  t: q.title, s: q.statement, ty: q.type, l: q.languages, sc: toPlain(q.starterCode), tl: q.timeLimitMs, ml: q.memoryLimitKb,
  r: q.referenceSolution || null, w: q.wrongSolution || null, o: q.options || [], c: q.correct || [], ta: q.traceAnswer || null,
  tests: tests.map((x) => [x.input, x.expectedOutput, !!x.visible, x.weight, x.comparison]),
})).digest('hex');

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
  visibleTests: tests.filter((t) => t.visible).map((t) => ({ id: idOf(t), input: t.input, expectedOutput: t.expectedOutput })),
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

// STAFF view: full question including solutions.
export const staffQuestion = (q, tests, { editable }) => ({
  id: idOf(q), institutionId: q.institutionId ? String(q.institutionId) : null, authorId: q.authorId ? String(q.authorId) : null,
  slug: q.slug || null, variantGroup: q.variantGroup || null, title: q.title, statement: q.statement, type: q.type, topic: q.topic || [], difficulty: q.difficulty,
  languages: q.languages || [], starterCode: toPlain(q.starterCode), timeLimitMs: q.timeLimitMs, memoryLimitKb: q.memoryLimitKb,
  estimatedMinutes: q.estimatedMinutes ?? null, learningOutcome: q.learningOutcome || '', source: q.source, status: q.status,
  version: q.version, referenceSolution: q.referenceSolution || null, altReferenceSolutions: q.altReferenceSolutions || [],
  wrongSolution: q.wrongSolution || null, options: q.options || [], correct: q.correct || [], multi: !!q.multi,
  traceAnswer: q.traceAnswer ?? null, explanation: q.explanation ?? null,
  validation: q.validation ? { ...q.validation, current: q.validation.contentHash === contentHash(q, tests || []) } : null,
  editable, createdAt: q.createdAt, updatedAt: q.updatedAt,
  ...(tests ? { tests: tests.map(staffTest) } : {}),
});

export const staffTest = (t) => ({
  id: idOf(t), input: t.input, expectedOutput: t.expectedOutput, visible: !!t.visible, weight: t.weight, comparison: t.comparison,
});

export const staffListItem = (q, editable) => ({
  id: idOf(q), title: q.title, type: q.type, topic: q.topic || [], difficulty: q.difficulty, source: q.source, status: q.status,
  version: q.version, authorId: q.authorId ? String(q.authorId) : null, isSeed: q.source === 'seed', editable, updatedAt: q.updatedAt,
});
