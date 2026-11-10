// Student practice API. Only server-side sandbox results are ever stored or scored; any execution result in a
// request body is ignored.
import questionRepo from './practice.repo.js';
import { institutionOf } from '../../middleware/tenancy.js';
import { MAX_SOURCE_CHARS } from '../../services/execution/index.js';
import { normalizeLanguage } from '../../services/execution/languages.js';
import { studentQuestion, studentListItem } from '../../services/questionSerializers.js';
import { runForQuestion, submitForQuestion, recordBrowserRun, CODE_TYPES } from './practice.service.js';

export const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const loadPublished = async (req, res) => {
  if (!isId(req.params.id)) { fail(res, 404, 'Question not found'); return null; }
  const q = await questionRepo.findVisible(institutionOf(req), req.params.id, { staff: true });
  if (!q || q.status !== 'published') { fail(res, 404, 'Question not found'); return null; }
  return q;
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

const send = (res, result) => res.status(result.status).json(result.body);

export const runCode = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  send(res, await runForQuestion(q, req.body, { institutionId: institutionOf(req), userId: req.user.id }));
};

// Activity record for a Run that happened in the student's browser. Unverified; never scored or counted as solved.
export const browserRun = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  send(res, await recordBrowserRun(q, req.body, { institutionId: institutionOf(req), userId: req.user.id }));
};

export const submit = async (req, res) => {
  const q = await loadPublished(req, res);
  if (!q) return;
  send(res, await submitForQuestion(q, req.body, { institutionId: institutionOf(req), userId: req.user.id }));
};

// ---- drafts and autosave ----
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
