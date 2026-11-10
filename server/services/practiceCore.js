// The Phase 2 run / submit / event-cleaning logic as plain functions that return { status, body }, used by the
// practice API. `ctx.attemptExtra` (optional) is merged into every stored attempt.
import questionRepo from '../repositories/questionRepo.js';
import { gradeTests } from './grading.js';
import {
  run as runOnce, MAX_SOURCE_CHARS, MAX_STDIN_CHARS, ExecutionUnavailableError, UnsupportedLanguageError,
} from './execution/index.js';
import { normalizeLanguage } from './execution/languages.js';
import { studentTestResults, storedPerTest } from './questionSerializers.js';

export const CODE_TYPES = ['coding', 'debug'];
const bad = (status, message, extra = {}) => ({ status, body: { success: false, message, ...extra } });
const normText = (s) => String(s ?? '').trim().replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n');

export const unavailable = () => bad(503, 'Code execution is currently unavailable. Nothing was scored.', { verdict: 'unavailable' });

// Returns { lang } or { error: result }.
export const pickLanguage = (q, language) => {
  const lang = normalizeLanguage(language);
  if (!lang) return { error: bad(400, `Unsupported language: ${language}`) };
  if (q.languages?.length && !q.languages.map(normalizeLanguage).includes(lang)) return { error: bad(400, `This question does not allow ${lang}`) };
  return { lang };
};

export const checkSource = (source) => {
  if (typeof source !== 'string' || !source.trim()) return bad(400, 'source is required');
  if (source.length > MAX_SOURCE_CHARS) return bad(413, 'Code is too large');
  return null;
};

const handleRunError = (error) => {
  if (error instanceof ExecutionUnavailableError) return unavailable();
  if (error instanceof UnsupportedLanguageError) return bad(400, error.message);
  throw error;
};

const detailFor = (graded, tests) => {
  const d = {};
  for (const t of graded.perTest.filter((x) => x.visible)) {
    const def = tests.find((x) => String(x._id) === t.testId);
    d[t.testId] = { input: def.input, expectedOutput: def.expectedOutput, actualOutput: t.stdout, error: t.compileOutput || t.stderr || '' };
  }
  return d;
};

export const runForQuestion = async (q, body, ctx) => {
  if (!CODE_TYPES.includes(q.type)) return bad(400, 'This question is not a coding question');
  const { language, source, stdin } = body || {};
  const picked = pickLanguage(q, language);
  if (picked.error) return picked.error;
  const srcErr = checkSource(source);
  if (srcErr) return srcErr;
  if (stdin !== undefined && (typeof stdin !== 'string' || stdin.length > MAX_STDIN_CHARS)) return bad(400, 'stdin must be a string of at most 16 KB');
  const lang = picked.lang;
  const base = {
    userId: ctx.userId, institutionId: ctx.institutionId, questionId: q._id, questionVersion: q.version, runKind: 'run', language: lang, source,
    ...(ctx.attemptExtra || {}),
  };
  try {
    if (typeof stdin === 'string' && stdin !== '') {
      const r = await runOnce({ language: lang, source, stdin, limits: { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb } });
      await questionRepo.createAttempt({ ...base, verdict: r.status, perTest: [], score: null });
      return {
        status: 200,
        body: {
          success: true, mode: 'custom', verdict: r.status, stdout: r.stdout, stderr: r.stderr, compileOutput: r.compileOutput,
          timeMs: r.timeMs, memoryKb: r.memoryKb,
        },
      };
    }
    const visible = (await questionRepo.listTests(q._id)).filter((t) => t.visible);
    if (!visible.length) return bad(409, 'This question has no visible tests; provide stdin to run your code');
    const graded = await gradeTests({ language: lang, source, tests: visible, limits: { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb } });
    await questionRepo.createAttempt({ ...base, verdict: graded.verdict, perTest: storedPerTest(graded.perTest), score: null });
    return {
      status: 200,
      body: { success: true, mode: 'visible_tests', verdict: graded.verdict, tests: studentTestResults(graded.perTest, { detail: detailFor(graded, visible) }) },
    };
  } catch (error) {
    return handleRunError(error);
  }
};

// Result also carries `attempt` (the stored document) for callers that need it.
export const submitForQuestion = async (q, body, ctx) => {
  const base = {
    userId: ctx.userId, institutionId: ctx.institutionId, questionId: q._id, questionVersion: q.version, runKind: 'submit', ...(ctx.attemptExtra || {}),
  };
  body = body || {};
  const objective = (attempt) => ({
    status: 200,
    attempt,
    body: { success: true, attemptId: String(attempt._id), verdict: attempt.verdict, score: attempt.score, explanation: q.explanation || '' },
  });

  if (q.type === 'mcq') {
    if (!Array.isArray(body.selected) || !body.selected.every((n) => Number.isInteger(n) && n >= 0 && n < (q.options || []).length)) {
      return bad(400, 'selected must be an array of option indexes');
    }
    const picked = [...new Set(body.selected)].sort();
    const right = [...(q.correct || [])].sort();
    const ok = picked.length === right.length && picked.every((n, i) => n === right[i]);
    return objective(await questionRepo.createAttempt({ ...base, verdict: ok ? 'accepted' : 'wrong_answer', score: ok ? 100 : 0, answer: picked }));
  }
  if (q.type === 'trace') {
    if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 2000) return bad(400, 'answer is required');
    const ok = normText(body.answer) === normText(q.traceAnswer);
    return objective(await questionRepo.createAttempt({ ...base, verdict: ok ? 'accepted' : 'wrong_answer', score: ok ? 100 : 0, answer: body.answer }));
  }
  if (q.type === 'short' || q.type === 'behavioural') {
    if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 8000) return bad(400, 'answer is required (max 8000 characters)');
    const attempt = await questionRepo.createAttempt({ ...base, verdict: 'pending_review', score: null, answer: body.answer, needsReview: true });
    return {
      status: 200,
      attempt,
      body: { success: true, attemptId: String(attempt._id), verdict: 'pending_review', score: null, message: 'Saved. A lecturer will review this answer.' },
    };
  }

  // coding / debug: every test, server-side, as one batch
  const picked = pickLanguage(q, body.language);
  if (picked.error) return picked.error;
  const srcErr = checkSource(body.source);
  if (srcErr) return srcErr;
  const tests = await questionRepo.listTests(q._id);
  if (!tests.length) return bad(409, 'This question has no tests yet');
  try {
    const graded = await gradeTests({ language: picked.lang, source: body.source, tests, limits: { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb } });
    const attempt = await questionRepo.createAttempt({
      ...base, language: picked.lang, source: body.source, verdict: graded.verdict, perTest: storedPerTest(graded.perTest), score: graded.score,
    });
    return {
      status: 200,
      attempt,
      body: {
        success: true, attemptId: String(attempt._id), verdict: graded.verdict, score: graded.score,
        passed: graded.perTest.filter((t) => t.passed).length, total: graded.perTest.length,
        tests: studentTestResults(graded.perTest, { detail: detailFor(graded, tests) }),
      },
    };
  } catch (error) {
    return handleRunError(error);
  }
};

// ---- edit events ----
export const EVENT_LIMITS = { maxEventsPerBatch: 500, maxBytesPerBatch: 64 * 1024, maxBatchesPerAttempt: 1000, maxTextChars: 2000 };
const EVENT_TYPES = ['insert', 'delete', 'paste', 'focus', 'blur'];

// Returns { clean } or { error: result }.
export const cleanEvents = (events) => {
  if (!Array.isArray(events) || !events.length) return { error: bad(400, 'events must be a non-empty array') };
  if (events.length > EVENT_LIMITS.maxEventsPerBatch) return { error: bad(413, `At most ${EVENT_LIMITS.maxEventsPerBatch} events per batch`) };
  if (JSON.stringify(events).length > EVENT_LIMITS.maxBytesPerBatch) return { error: bad(413, 'Event batch is too large') };
  const clean = [];
  for (const e of events) {
    if (!e || typeof e !== 'object' || !EVENT_TYPES.includes(e.type) || !Number.isFinite(e.t) || e.t < 0) return { error: bad(400, 'Each event needs a valid type and t (ms)') };
    const len = Number.isFinite(e.len) ? Math.max(0, Math.min(Math.trunc(e.len), 1e6)) : 0;
    const item = { t: Math.trunc(e.t), type: e.type, len };
    if (Number.isFinite(e.pos) && e.pos >= 0) item.pos = Math.trunc(e.pos);
    if (typeof e.text === 'string') item.text = e.text.slice(0, EVENT_LIMITS.maxTextChars);
    clean.push(item);
  }
  return { clean };
};
