// Grading queue for short and behavioural answers. The AI only ever SUGGESTS rubric points (source 'ai').
// A final score exists only after a lecturer confirms or overrides it (source 'human', confirmedBy set).
import peopleRepo from '../people/people.repo.js';
import questionRepo from '../../repositories/questionRepo.js';
import { institutionOf } from '../../middleware/tenancy.js';
import { audit } from '../../services/audit.js';
import aiService from '../../services/aiService.js';
import { fail, isId } from '../analytics/analytics.request.js';
import gradingRepo from './grading.repo.js';

const MAX_BULK = 50;
const r2 = (n) => Math.round(n * 100) / 100;

// Lecturers and admins grade every practice answer in their own university. Every repository call below is
// filtered by the caller's institutionId, so another university's answers are never found.
const rubricOf = async (institutionId, questionId) => {
  const r = await questionRepo.getRubric(institutionId, questionId);
  return r?.criteria?.length ? r.criteria : null;
};

// Loads one attempt with its question and rubric, or null when it is not visible to the caller.
const loadItem = async (req, id) => {
  if (!isId(id)) return null;
  const institutionId = institutionOf(req);
  const attempt = await gradingRepo.find(institutionId, id);
  if (!attempt) return null;
  const question = await questionRepo.findVisible(institutionId, attempt.questionId);
  if (!question) return null;
  return { institutionId, attempt, question, rubric: await rubricOf(institutionId, attempt.questionId) };
};

const view = (attempt, question, rubric, student) => ({
  id: String(attempt._id), questionId: String(attempt.questionId), questionTitle: question.title, questionType: question.type,
  studentId: String(attempt.userId), studentName: student?.name || null, submittedAt: attempt.createdAt,
  status: attempt.review?.final ? 'reviewed' : 'pending_review',
  hasAiSuggestion: !!attempt.review?.aiSuggestion, score: attempt.score ?? null, scoreSource: attempt.scoreSource || null,
  ...(rubric ? { rubricTotal: rubric.reduce((n, c) => n + c.maxPoints, 0) } : {}),
});

export const queue = async (req, res) => {
  const institutionId = institutionOf(req);
  const status = req.query.status === 'reviewed' ? 'reviewed' : 'pending';
  const { questionId } = req.query;
  if (questionId && !isId(questionId)) return fail(res, 400, 'Invalid questionId');
  const rows = await gradingRepo.list(institutionId, { status, userIds: null, questionId: questionId || null });
  const qids = [...new Set(rows.map((r) => String(r.questionId)))];
  const questions = new Map();
  for (const qid of qids) questions.set(qid, await questionRepo.findVisible(institutionId, qid));
  const users = rows.length ? await peopleRepo.findUsersByIds(institutionId, [...new Set(rows.map((r) => String(r.userId)))]) : [];
  const names = new Map(users.map((u) => [String(u._id), u]));
  const items = rows.map((a) => {
    const q = questions.get(String(a.questionId));
    return q ? view(a, q, null, names.get(String(a.userId))) : null;
  }).filter(Boolean);
  res.json({ success: true, status, items, count: items.length });
};

const full = async (item) => {
  const [student] = await peopleRepo.findUsersByIds(item.institutionId, [item.attempt.userId]);
  const { attempt, question, rubric } = item;
  return {
    ...view(attempt, question, rubric, student),
    question: { statement: question.statement, type: question.type, topic: question.topic || [] },
    rubric: rubric ? rubric.map((c) => ({ name: c.name, description: c.description || '', maxPoints: c.maxPoints, levels: c.levels || [] })) : null,
    answer: typeof attempt.answer === 'string' ? attempt.answer : String(attempt.answer ?? ''),
    aiSuggestion: attempt.review?.aiSuggestion || null,
    final: attempt.review?.final || null,
  };
};

export const getItem = async (req, res) => {
  const item = await loadItem(req, req.params.id);
  if (!item) return fail(res, 404, 'Item not found');
  res.json({ success: true, item: await full(item) });
};

// Forces the model output onto the rubric: unknown criteria dropped, missing ones scored 0, points clamped.
export const normaliseSuggestion = (raw, rubric) => {
  const list = Array.isArray(raw?.criteria) ? raw.criteria : [];
  const criteria = rubric.map((c) => {
    const hit = list.find((x) => String(x?.name || '').trim().toLowerCase() === c.name.trim().toLowerCase());
    const n = Number(hit?.points);
    return {
      name: c.name, maxPoints: c.maxPoints,
      points: Number.isFinite(n) ? r2(Math.max(0, Math.min(c.maxPoints, n))) : 0,
      reason: hit ? String(hit.reason || '').slice(0, 1000) : 'No suggestion for this criterion',
    };
  });
  return {
    source: 'ai', criteria, total: r2(criteria.reduce((n, c) => n + c.points, 0)), maxTotal: criteria.reduce((n, c) => n + c.maxPoints, 0),
    summary: String(raw?.summary || '').slice(0, 2000), at: new Date(),
  };
};

export const suggest = async (req, res) => {
  const item = await loadItem(req, req.params.id);
  if (!item) return fail(res, 404, 'Item not found');
  if (!item.attempt.needsReview) return fail(res, 409, 'This answer has already been reviewed');
  if (!item.rubric) return fail(res, 409, 'This question has no rubric. Add a rubric before asking for an AI suggestion.');
  let raw;
  try {
    raw = await aiService.suggestRubricScore({ question: item.question.statement || item.question.title, rubric: item.rubric, answer: item.attempt.answer });
  } catch (error) {
    if (error?.code === 'AI_MONTHLY_CAP') {
      return fail(res, 429, 'Your university has reached its monthly AI limit. You can still grade this answer manually.', { code: 'AI_MONTHLY_CAP', manualGradingAvailable: true });
    }
    console.error('Rubric suggestion failed:', error.message);
    return fail(res, 502, 'The AI could not produce a suggestion. You can grade this answer manually.', { manualGradingAvailable: true });
  }
  const suggestion = normaliseSuggestion(raw, item.rubric);
  const saved = await gradingRepo.saveSuggestion(item.institutionId, item.attempt._id, suggestion);
  if (!saved) return fail(res, 409, 'This answer has already been reviewed');
  await audit({ actor: req.user.id, action: 'grading.suggest', target: item.attempt._id, institutionId: item.institutionId, meta: { questionId: String(item.attempt.questionId) } });
  res.json({ success: true, aiSuggestion: suggestion, note: 'This is a suggestion only. No score is recorded until you confirm it.' });
};

// Validates per-criterion points against the rubric. Returns { criteria } or { error }.
const buildFinal = (rubric, input, suggestion) => {
  let source = input;
  if (!source) {
    if (!suggestion) return { error: 'There is no AI suggestion to accept. Send criteria.' };
    source = suggestion.criteria.map((c) => ({ name: c.name, points: c.points }));
  }
  if (!Array.isArray(source)) return { error: 'criteria must be an array' };
  const criteria = [];
  for (const c of rubric) {
    const matches = source.filter((x) => String(x?.name || '').trim().toLowerCase() === c.name.trim().toLowerCase());
    if (matches.length !== 1) return { error: `Provide points for criterion "${c.name}" exactly once` };
    const points = Number(matches[0].points);
    if (!Number.isFinite(points) || points < 0 || points > c.maxPoints) return { error: `Points for "${c.name}" must be between 0 and ${c.maxPoints}` };
    criteria.push({ name: c.name, maxPoints: c.maxPoints, points: r2(points), comment: String(matches[0].comment || '').slice(0, 1000) });
  }
  return { criteria };
};

const confirmItem = async (req, item, { input, comment, accepted }) => {
  const built = buildFinal(item.rubric, input, item.attempt.review?.aiSuggestion);
  if (built.error) return { status: 400, message: built.error };
  const total = r2(built.criteria.reduce((n, c) => n + c.points, 0));
  const maxTotal = built.criteria.reduce((n, c) => n + c.maxPoints, 0);
  if (!maxTotal) return { status: 400, message: 'The rubric has no points to award' };
  const sug = item.attempt.review?.aiSuggestion;
  const overrodeAi = !!sug && built.criteria.some((c) => sug.criteria.find((s) => s.name === c.name)?.points !== c.points);
  const final = {
    source: 'human', criteria: built.criteria, total, maxTotal, comment: String(comment || '').slice(0, 2000),
    confirmedBy: req.user.id, acceptedAiSuggestion: !!accepted && !overrodeAi, overrodeAi, at: new Date(),
  };
  const saved = await gradingRepo.confirm(item.institutionId, item.attempt._id, final, Math.round((total / maxTotal) * 100));
  if (!saved) return { status: 409, message: 'This answer has already been reviewed' };
  await audit({
    actor: req.user.id, action: 'grading.confirm', target: item.attempt._id, institutionId: item.institutionId,
    meta: { questionId: String(item.attempt.questionId), total, maxTotal, acceptedAiSuggestion: final.acceptedAiSuggestion, overrodeAi },
  });
  return { saved };
};

export const confirm = async (req, res) => {
  const item = await loadItem(req, req.params.id);
  if (!item) return fail(res, 404, 'Item not found');
  if (!item.attempt.needsReview) return fail(res, 409, 'This answer has already been reviewed');
  if (!item.rubric) return fail(res, 409, 'This question has no rubric. Add a rubric before grading.');
  const body = req.body || {};
  const r = await confirmItem(req, item, {
    input: body.criteria, comment: body.comment, accepted: body.acceptAiSuggestion === true && !body.criteria,
  });
  if (r.status) return fail(res, r.status, r.message);
  res.json({ success: true, item: await full({ ...item, attempt: r.saved }) });
};

// Only items explicitly listed with decision "accept_ai_suggestion" are confirmed. There is no "accept all".
export const bulkConfirm = async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'items must be a non-empty array');
  if (items.length > MAX_BULK) return fail(res, 400, `At most ${MAX_BULK} items per request`);
  const results = [];
  for (const entry of items) {
    const id = String(entry?.attemptId || '');
    if (entry?.decision !== 'accept_ai_suggestion') { results.push({ attemptId: id, status: 'skipped', reason: 'decision must be "accept_ai_suggestion"' }); continue; }
    const item = await loadItem(req, id);
    if (!item) { results.push({ attemptId: id, status: 'skipped', reason: 'not found' }); continue; }
    if (!item.attempt.needsReview) { results.push({ attemptId: id, status: 'skipped', reason: 'already reviewed' }); continue; }
    if (!item.rubric) { results.push({ attemptId: id, status: 'skipped', reason: 'question has no rubric' }); continue; }
    if (!item.attempt.review?.aiSuggestion) { results.push({ attemptId: id, status: 'skipped', reason: 'no AI suggestion stored' }); continue; }
    const r = await confirmItem(req, item, { input: null, comment: entry.comment, accepted: true });
    results.push(r.status ? { attemptId: id, status: 'skipped', reason: r.message } : { attemptId: id, status: 'confirmed', score: r.saved.score });
  }
  await audit({
    actor: req.user.id, action: 'grading.bulk_confirm', institutionId: institutionOf(req),
    meta: { requested: items.length, confirmed: results.filter((r) => r.status === 'confirmed').length },
  });
  res.json({ success: true, results });
};
