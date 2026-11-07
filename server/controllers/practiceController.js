// Student practice API. Only server-side sandbox results are ever stored or scored; any execution result in a
// request body is ignored.
import questionRepo from '../repositories/questionRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { gradeTests } from '../services/grading.js';
import {
  run as runOnce, MAX_SOURCE_CHARS, MAX_STDIN_CHARS, ExecutionUnavailableError, UnsupportedLanguageError,
} from '../services/execution/index.js';
import { normalizeLanguage } from '../services/execution/languages.js';
import {
  studentQuestion, studentListItem, studentTestResults, storedPerTest,
} from '../services/questionSerializers.js';

export const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const CODE_TYPES = ['coding', 'debug'];
const unavailable = (res) => fail(res, 503, 'Code execution is currently unavailable. Nothing was scored.', { verdict: 'unavailable' });
const normText = (s) => String(s ?? '').trim().replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n');

const loadPublished = async (req, res) => {
  if (!isId(req.params.id)) { fail(res, 404, 'Question not found'); return null; }
  const q = await questionRepo.findVisible(institutionOf(req), req.params.id, { staff: true });
  if (!q || q.status !== 'published') { fail(res, 404, 'Question not found'); return null; }
  return q;
};

// Returns the canonical language or sends a 400.
const pickLanguage = (q, language, res) => {
  const lang = normalizeLanguage(language);
  if (!lang) { fail(res, 400, `Unsupported language: ${language}`); return null; }
  if (q.languages?.length && !q.languages.map(normalizeLanguage).includes(lang)) {
    fail(res, 400, `This question does not allow ${lang}`); return null;
  }
  return lang;
};

const checkSource = (source, res) => {
  if (typeof source !== 'string' || !source.trim()) { fail(res, 400, 'source is required'); return false; }
  if (source.length > MAX_SOURCE_CHARS) { fail(res, 413, 'Code is too large'); return false; }
  return true;
};

const handleRunError = (error, res) => {
  if (error instanceof ExecutionUnavailableError) return unavailable(res);
  if (error instanceof UnsupportedLanguageError) return fail(res, 400, error.message);
  throw error;
};

const detailFor = (graded, tests) => {
  const d = {};
  for (const t of graded.perTest.filter((x) => x.visible)) {
    const def = tests.find((x) => String(x._id) === t.testId);
    d[t.testId] = {
      input: def.input, expectedOutput: def.expectedOutput, actualOutput: t.stdout,
      error: t.compileOutput || t.stderr || '',
    };
  }
  return d;
};

export const listQuestions = async (req, res) => {
  const institutionId = institutionOf(req);
  const { topic, difficulty, type, unseen } = req.query;
  const filter = { status: 'published' };
  if (typeof topic === 'string' && topic) filter.topic = topic;
  if (typeof difficulty === 'string' && difficulty) filter.difficulty = difficulty;
  if (typeof type === 'string' && type) filter.type = type;
  if (unseen === '1' || unseen === 'true') filter.excludeIds = await questionRepo.solvedQuestionIds(institutionId, req.user.id);
  const questions = await questionRepo.listVisible(institutionId, filter);
  res.json({ success: true, questions: questions.map(studentListItem) });
};

export const getQuestion = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  const tests = CODE_TYPES.includes(q.type) ? await questionRepo.listTests(q._id) : [];
  res.json({ success: true, question: studentQuestion(q, tests) });
};

export const runCode = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  if (!CODE_TYPES.includes(q.type)) return fail(res, 400, 'This question is not a coding question');
  const { language, source, stdin } = req.body || {};
  const lang = pickLanguage(q, language, res);
  if (!lang || !checkSource(source, res)) return;
  if (stdin !== undefined && (typeof stdin !== 'string' || stdin.length > MAX_STDIN_CHARS)) return fail(res, 400, 'stdin must be a string of at most 16 KB');
  const institutionId = institutionOf(req);
  const base = { userId: req.user.id, institutionId, questionId: q._id, questionVersion: q.version, runKind: 'run', language: lang, source };
  try {
    if (typeof stdin === 'string' && stdin !== '') {
      const r = await runOnce({ language: lang, source, stdin, limits: { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb } });
      await questionRepo.createAttempt({ ...base, verdict: r.status, perTest: [], score: null });
      return res.json({
        success: true, mode: 'custom', verdict: r.status, stdout: r.stdout, stderr: r.stderr, compileOutput: r.compileOutput,
        timeMs: r.timeMs, memoryKb: r.memoryKb,
      });
    }
    const visible = (await questionRepo.listTests(q._id)).filter((t) => t.visible);
    if (!visible.length) return fail(res, 409, 'This question has no visible tests; provide stdin to run your code');
    const graded = await gradeTests({ language: lang, source, tests: visible, limits: { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb } });
    await questionRepo.createAttempt({ ...base, verdict: graded.verdict, perTest: storedPerTest(graded.perTest), score: null });
    return res.json({
      success: true, mode: 'visible_tests', verdict: graded.verdict,
      tests: studentTestResults(graded.perTest, { detail: detailFor(graded, visible) }),
    });
  } catch (error) {
    return handleRunError(error, res);
  }
};

export const submit = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  const institutionId = institutionOf(req);
  const base = { userId: req.user.id, institutionId, questionId: q._id, questionVersion: q.version, runKind: 'submit' };
  const body = req.body || {};

  if (q.type === 'mcq') {
    if (!Array.isArray(body.selected) || !body.selected.every((n) => Number.isInteger(n) && n >= 0 && n < (q.options || []).length)) {
      return fail(res, 400, 'selected must be an array of option indexes');
    }
    const picked = [...new Set(body.selected)].sort();
    const right = [...(q.correct || [])].sort();
    const ok = picked.length === right.length && picked.every((n, i) => n === right[i]);
    const attempt = await questionRepo.createAttempt({ ...base, verdict: ok ? 'accepted' : 'wrong_answer', score: ok ? 100 : 0, answer: picked });
    return res.json({ success: true, attemptId: String(attempt._id), verdict: attempt.verdict, score: attempt.score, explanation: q.explanation || '' });
  }
  if (q.type === 'trace') {
    if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 2000) return fail(res, 400, 'answer is required');
    const ok = normText(body.answer) === normText(q.traceAnswer);
    const attempt = await questionRepo.createAttempt({ ...base, verdict: ok ? 'accepted' : 'wrong_answer', score: ok ? 100 : 0, answer: body.answer });
    return res.json({ success: true, attemptId: String(attempt._id), verdict: attempt.verdict, score: attempt.score, explanation: q.explanation || '' });
  }
  if (q.type === 'short' || q.type === 'behavioural') {
    if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 8000) return fail(res, 400, 'answer is required (max 8000 characters)');
    const attempt = await questionRepo.createAttempt({ ...base, verdict: 'pending_review', score: null, answer: body.answer, needsReview: true });
    return res.json({ success: true, attemptId: String(attempt._id), verdict: 'pending_review', score: null, message: 'Saved. A lecturer will review this answer.' });
  }

  // coding / debug: every test, server-side, as one batch
  const lang = pickLanguage(q, body.language, res);
  if (!lang || !checkSource(body.source, res)) return;
  const tests = await questionRepo.listTests(q._id);
  if (!tests.length) return fail(res, 409, 'This question has no tests yet');
  try {
    const graded = await gradeTests({ language: lang, source: body.source, tests, limits: { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb } });
    const attempt = await questionRepo.createAttempt({
      ...base, language: lang, source: body.source, verdict: graded.verdict, perTest: storedPerTest(graded.perTest), score: graded.score,
    });
    return res.json({
      success: true, attemptId: String(attempt._id), verdict: graded.verdict, score: graded.score,
      passed: graded.perTest.filter((t) => t.passed).length, total: graded.perTest.length,
      tests: studentTestResults(graded.perTest, { detail: detailFor(graded, tests) }),
    });
  } catch (error) {
    return handleRunError(error, res);
  }
};

// ---- drafts, autosave, edit events ----
const draftView = (a) => ({ attemptId: String(a._id), questionId: String(a.questionId), language: a.language || null, source: a.source || '', updatedAt: a.updatedAt || null });

export const startDraft = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  const institutionId = institutionOf(req);
  let draft = await questionRepo.findDraft(institutionId, req.user.id, q._id);
  if (!draft) {
    draft = await questionRepo.createAttempt({
      userId: req.user.id, institutionId, questionId: q._id, questionVersion: q.version, runKind: 'draft', language: q.languages?.[0] || null, source: '',
    });
  }
  res.status(200).json({ success: true, draft: draftView(draft) });
};

export const getDraft = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  const draft = await questionRepo.findDraft(institutionOf(req), req.user.id, q._id);
  res.json({ success: true, draft: draft ? draftView(draft) : null });
};

export const autosave = async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Attempt not found');
  const { language, source } = req.body || {};
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) return fail(res, 400, 'source must be a string of at most 64 KB');
  const lang = normalizeLanguage(language);
  if (!lang) return fail(res, 400, 'Unsupported language');
  const institutionId = institutionOf(req);
  const attempt = await questionRepo.findAttempt(institutionId, req.user.id, req.params.id);
  if (!attempt || attempt.runKind !== 'draft') return fail(res, 404, 'Attempt not found');
  const updated = await questionRepo.updateAttempt(institutionId, req.user.id, req.params.id, { language: lang, source });
  res.json({ success: true, draft: draftView(updated) });
};

export const EVENT_LIMITS = { maxEventsPerBatch: 500, maxBytesPerBatch: 64 * 1024, maxBatchesPerAttempt: 1000, maxTextChars: 2000 };
const EVENT_TYPES = ['insert', 'delete', 'paste', 'focus', 'blur'];

export const addEvents = async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 404, 'Attempt not found');
  const { events, seq } = req.body || {};
  if (!Array.isArray(events) || !events.length) return fail(res, 400, 'events must be a non-empty array');
  if (events.length > EVENT_LIMITS.maxEventsPerBatch) return fail(res, 413, `At most ${EVENT_LIMITS.maxEventsPerBatch} events per batch`);
  if (JSON.stringify(events).length > EVENT_LIMITS.maxBytesPerBatch) return fail(res, 413, 'Event batch is too large');
  const clean = [];
  for (const e of events) {
    if (!e || typeof e !== 'object' || !EVENT_TYPES.includes(e.type) || !Number.isFinite(e.t) || e.t < 0) return fail(res, 400, 'Each event needs a valid type and t (ms)');
    const len = Number.isFinite(e.len) ? Math.max(0, Math.min(Math.trunc(e.len), 1e6)) : 0;
    const item = { t: Math.trunc(e.t), type: e.type, len };
    if (Number.isFinite(e.pos) && e.pos >= 0) item.pos = Math.trunc(e.pos);
    if (typeof e.text === 'string') item.text = e.text.slice(0, EVENT_LIMITS.maxTextChars);
    clean.push(item);
  }
  const institutionId = institutionOf(req);
  const attempt = await questionRepo.findAttempt(institutionId, req.user.id, req.params.id);
  if (!attempt) return fail(res, 404, 'Attempt not found');
  if (await questionRepo.countEventBatches(institutionId, attempt._id) >= EVENT_LIMITS.maxBatchesPerAttempt) return fail(res, 429, 'Too many event batches for this attempt');
  await questionRepo.addEventBatch({
    attemptId: attempt._id, questionId: attempt.questionId, userId: req.user.id, institutionId, seq: Number.isInteger(seq) ? seq : 0, events: clean,
  });
  res.status(201).json({ success: true, stored: clean.length });
};
