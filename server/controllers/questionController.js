// Lecturer / admin question bank API. Tenant-scoped; lecturers edit only their own questions, admins any in the institution.
// The global seed bank is readable but never editable: duplicate it first.
import questionRepo from '../repositories/questionRepo.js';
import { institutionOf } from '../middleware/tenancy.js';
import { audit } from '../services/audit.js';
import { gradeTests } from '../services/grading.js';
import { ExecutionUnavailableError, UnsupportedLanguageError, MAX_SOURCE_CHARS } from '../services/execution/index.js';
import { normalizeLanguage } from '../services/execution/languages.js';
import { draftQuestions } from '../services/questionDrafting.js';
import { QUESTION_TYPES, QUESTION_STATUSES, DIFFICULTIES, AUTO_CODE_TYPES } from '../models/Question.js';
import { contentHash, staffQuestion, staffListItem, staffTest } from '../services/questionSerializers.js';

const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const isAdmin = (req) => req.user.role === 'university_admin';
const canEdit = (req, q) => !!q.institutionId && String(q.institutionId) === String(institutionOf(req)) && (isAdmin(req) || String(q.authorId) === String(req.user.id));

const TRANSITIONS = {
  draft: ['in_review', 'published'],
  in_review: ['draft', 'published'],
  published: ['retired', 'draft'],
  retired: ['draft'],
};

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const strList = (v, max, n) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, n) : undefined);
const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

const cleanCode = (v) => {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const language = normalizeLanguage(v.language);
  if (!language || typeof v.source !== 'string' || !v.source.trim() || v.source.length > MAX_SOURCE_CHARS) return undefined;
  return { language, source: v.source };
};

// Only these fields can be set by a client. status, version, source, authorId and validation are never taken from a body.
const pickQuestionFields = (b, { creating }) => {
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  set('title', str(b.title, 200));
  set('statement', typeof b.statement === 'string' ? b.statement.slice(0, 20000) : undefined);
  if (QUESTION_TYPES.includes(b.type) && creating) out.type = b.type; // type cannot change after creation
  set('topic', strList(b.topic, 60, 10));
  if (DIFFICULTIES.includes(b.difficulty)) out.difficulty = b.difficulty;
  if (Array.isArray(b.languages)) out.languages = [...new Set(b.languages.map(normalizeLanguage).filter(Boolean))];
  if (b.starterCode && typeof b.starterCode === 'object' && !Array.isArray(b.starterCode)) {
    out.starterCode = {};
    for (const [k, v] of Object.entries(b.starterCode)) {
      const lang = normalizeLanguage(k);
      if (lang && typeof v === 'string') out.starterCode[lang] = v.slice(0, MAX_SOURCE_CHARS);
    }
  }
  set('timeLimitMs', num(b.timeLimitMs, 100, 15000));
  set('memoryLimitKb', num(b.memoryLimitKb, 16000, 512000));
  set('estimatedMinutes', num(b.estimatedMinutes, 1, 240));
  set('learningOutcome', str(b.learningOutcome, 500));
  if (b.variantGroup === null) out.variantGroup = null;
  else set('variantGroup', str(b.variantGroup, 80));
  set('referenceSolution', cleanCode(b.referenceSolution));
  set('wrongSolution', cleanCode(b.wrongSolution));
  set('explanation', typeof b.explanation === 'string' ? b.explanation.slice(0, 4000) : undefined);
  set('traceAnswer', typeof b.traceAnswer === 'string' ? b.traceAnswer.slice(0, 2000) : undefined);
  if (Array.isArray(b.options)) out.options = b.options.filter((x) => typeof x === 'string').map((x) => x.slice(0, 500)).slice(0, 10);
  if (Array.isArray(b.correct)) out.correct = [...new Set(b.correct.filter(Number.isInteger))].sort();
  if (typeof b.multi === 'boolean') out.multi = b.multi;
  return out;
};

const loadVisible = async (req, res) => {
  if (!isId(req.params.id)) { fail(res, 404, 'Question not found'); return null; }
  const q = await questionRepo.findVisible(institutionOf(req), req.params.id, { staff: true });
  if (!q) { fail(res, 404, 'Question not found'); return null; }
  return q;
};

const loadEditable = async (req, res) => {
  const q = await loadVisible(req, res);
  if (!q) return null;
  if (!q.institutionId) { fail(res, 403, 'Seed questions cannot be edited. Duplicate it into your institution first.'); return null; }
  if (!canEdit(req, q)) { fail(res, 403, 'You can only edit your own questions'); return null; }
  return q;
};

// Any content change to a live question takes it off the student list until it is validated and published again.
const afterContentChange = async (req, q) => {
  if (q.status === 'published') return questionRepo.updateQuestion(institutionOf(req), q._id, { status: 'draft' });
  return q;
};

const respond = async (res, q, status = 200, extra = {}) => {
  const tests = AUTO_CODE_TYPES.includes(q.type) ? await questionRepo.listTests(q._id) : [];
  const editable = !!q.institutionId; // callers pass canEdit separately where needed
  res.status(status).json({ success: true, question: staffQuestion(q, tests, { editable }), ...extra });
};

export const listQuestions = async (req, res) => {
  const { status, type, topic, difficulty, mine } = req.query;
  const filter = {};
  if (QUESTION_STATUSES.includes(status)) filter.status = status;
  if (QUESTION_TYPES.includes(type)) filter.type = type;
  if (typeof topic === 'string' && topic) filter.topic = topic;
  if (DIFFICULTIES.includes(difficulty)) filter.difficulty = difficulty;
  if (mine === '1') filter.authorId = req.user.id;
  const list = await questionRepo.listVisible(institutionOf(req), filter);
  res.json({ success: true, questions: list.map((q) => staffListItem(q, canEdit(req, q))) });
};

export const getQuestion = async (req, res) => {
  const q = await loadVisible(req, res);
  if (!q) return;
  const tests = AUTO_CODE_TYPES.includes(q.type) ? await questionRepo.listTests(q._id) : [];
  res.json({ success: true, question: staffQuestion(q, tests, { editable: canEdit(req, q) }) });
};

export const createQuestion = async (req, res) => {
  const body = req.body || {};
  if (!QUESTION_TYPES.includes(body.type)) return fail(res, 400, `type must be one of ${QUESTION_TYPES.join(', ')}`);
  const fields = pickQuestionFields(body, { creating: true });
  if (!fields.title) return fail(res, 400, 'title is required');
  const q = await questionRepo.createQuestion({
    ...fields, institutionId: institutionOf(req), authorId: req.user.id, source: 'lecturer', status: 'draft', version: 1,
  });
  await audit({ actor: req.user.id, action: 'question.create', target: q._id, institutionId: institutionOf(req) });
  res.status(201).json({ success: true, question: staffQuestion(q, [], { editable: true }) });
};

export const updateQuestion = async (req, res) => {
  const q = await loadEditable(req, res);
  if (!q) return;
  const patch = pickQuestionFields(req.body || {}, { creating: false });
  if (!Object.keys(patch).length) return fail(res, 400, 'No editable fields in the request');
  if (q.status === 'published') patch.status = 'draft';
  const updated = await questionRepo.updateQuestion(institutionOf(req), q._id, patch);
  const tests = AUTO_CODE_TYPES.includes(updated.type) ? await questionRepo.listTests(updated._id) : [];
  res.json({ success: true, question: staffQuestion(updated, tests, { editable: true }) });
};

export const deleteQuestion = async (req, res) => {
  const q = await loadEditable(req, res);
  if (!q) return;
  if (await questionRepo.countAttemptsFor(q._id) > 0) return fail(res, 409, 'Students have attempted this question. Retire it instead of deleting it.');
  const institutionId = institutionOf(req);
  await questionRepo.deleteTestsOf(institutionId, q._id);
  await questionRepo.deleteRubric(institutionId, q._id);
  await questionRepo.deleteQuestion(institutionId, q._id);
  res.json({ success: true });
};

export const duplicateQuestion = async (req, res) => {
  const q = await loadVisible(req, res);
  if (!q) return;
  const institutionId = institutionOf(req);
  const tests = await questionRepo.listTests(q._id);
  const {
    _id, slug, createdAt, updatedAt, validation, publishedHash, ...rest
  } = q;
  const copy = await questionRepo.createQuestion({
    ...rest, title: q.institutionId ? `${q.title} (copy)` : q.title, institutionId, authorId: req.user.id, source: 'lecturer',
    status: 'draft', version: 1, duplicatedFrom: q._id,
  });
  for (const t of tests) {
    await questionRepo.addTest({
      institutionId, questionId: copy._id, input: t.input, expectedOutput: t.expectedOutput, visible: t.visible,
      weight: t.weight, comparison: t.comparison, order: t.order,
    });
  }
  const copied = await questionRepo.listTests(copy._id);
  res.status(201).json({ success: true, question: staffQuestion(copy, copied, { editable: true }) });
};

// ---- tests ----
const pickTest = (b) => {
  const t = {};
  if (typeof b.input === 'string') t.input = b.input.slice(0, 16384);
  if (typeof b.expectedOutput === 'string') t.expectedOutput = b.expectedOutput.slice(0, 16384);
  if (typeof b.visible === 'boolean') t.visible = b.visible;
  if (Number.isFinite(b.weight) && b.weight >= 0 && b.weight <= 100) t.weight = b.weight;
  if (['trim', 'exact', 'tokens'].includes(b.comparison)) t.comparison = b.comparison;
  return t;
};

const loadEditableCode = async (req, res) => {
  const q = await loadEditable(req, res);
  if (!q) return null;
  if (!AUTO_CODE_TYPES.includes(q.type)) { fail(res, 400, 'Only coding and debug questions have test cases'); return null; }
  return q;
};

export const listTests = async (req, res) => {
  const q = await loadVisible(req, res);
  if (!q) return;
  res.json({ success: true, tests: (await questionRepo.listTests(q._id)).map(staffTest) });
};

export const addTest = async (req, res) => {
  const q = await loadEditableCode(req, res);
  if (!q) return;
  const t = pickTest(req.body || {});
  if (t.expectedOutput === undefined) return fail(res, 400, 'expectedOutput is required');
  const existing = await questionRepo.listTests(q._id);
  if (existing.length >= 50) return fail(res, 409, 'At most 50 tests per question');
  const created = await questionRepo.addTest({ visible: false, weight: 1, comparison: 'trim', input: '', ...t, institutionId: institutionOf(req), questionId: q._id, order: existing.length });
  await afterContentChange(req, q);
  res.status(201).json({ success: true, test: staffTest(created) });
};

export const updateTest = async (req, res) => {
  const q = await loadEditableCode(req, res);
  if (!q) return;
  if (!isId(req.params.testId)) return fail(res, 404, 'Test not found');
  const patch = pickTest(req.body || {});
  if (!Object.keys(patch).length) return fail(res, 400, 'No editable fields in the request');
  const updated = await questionRepo.updateTest(institutionOf(req), q._id, req.params.testId, patch);
  if (!updated) return fail(res, 404, 'Test not found');
  await afterContentChange(req, q);
  res.json({ success: true, test: staffTest(updated) });
};

export const deleteTest = async (req, res) => {
  const q = await loadEditableCode(req, res);
  if (!q) return;
  if (!isId(req.params.testId)) return fail(res, 404, 'Test not found');
  const ok = await questionRepo.deleteTest(institutionOf(req), q._id, req.params.testId);
  if (!ok) return fail(res, 404, 'Test not found');
  await afterContentChange(req, q);
  res.json({ success: true });
};

// ---- validation gate ----
export const validateQuestion = async (req, res) => {
  const q = await loadEditableCode(req, res);
  if (!q) return;
  const institutionId = institutionOf(req);
  const body = req.body || {};
  if (body.wrongSolution !== undefined && cleanCode(body.wrongSolution) === undefined) return fail(res, 400, 'wrongSolution needs a supported language and source');
  const wrongSolution = body.wrongSolution !== undefined ? cleanCode(body.wrongSolution) : (q.wrongSolution || null);
  if (!q.referenceSolution?.source) return fail(res, 400, 'This question has no reference solution');
  if (q.source === 'ai_drafted' && !wrongSolution) return fail(res, 400, 'AI-drafted questions must include a wrong solution so the gate can prove the tests catch it');
  const tests = await questionRepo.listTests(q._id);
  if (!tests.length) return fail(res, 400, 'Add at least one test case first');
  const limits = { timeMs: q.timeLimitMs, memoryKb: q.memoryLimitKb };
  try {
    const ref = await gradeTests({ language: q.referenceSolution.language, source: q.referenceSolution.source, tests, limits });
    const referencePassed = ref.perTest.every((t) => t.passed);
    let wrongFailed = null;
    let wrongPerTest = null;
    if (wrongSolution) {
      const wrong = await gradeTests({ language: wrongSolution.language, source: wrongSolution.source, tests, limits });
      wrongFailed = wrong.perTest.some((t) => !t.passed);
      wrongPerTest = wrong.perTest;
    }
    const passed = referencePassed && (wrongSolution ? wrongFailed : true);
    const withWrong = { ...q, wrongSolution };
    const validation = {
      passed, contentHash: contentHash(withWrong, tests), version: q.version, referencePassed,
      wrongSolutionChecked: !!wrongSolution, wrongSolutionFailed: wrongFailed, testsRun: tests.length, at: new Date(), byUserId: req.user.id,
    };
    const patch = { validation };
    if (body.wrongSolution !== undefined) patch.wrongSolution = wrongSolution;
    await questionRepo.updateQuestion(institutionId, q._id, patch);
    const summarize = (per) => per.map((t, i) => ({
      index: i + 1, testId: t.testId, visible: t.visible, passed: t.passed, verdict: t.verdict, timeMs: t.timeMs,
      ...(t.passed ? {} : { stdout: t.stdout, stderr: t.compileOutput || t.stderr }),
    }));
    return res.json({
      success: true, passed, referencePassed, wrongSolutionChecked: !!wrongSolution, wrongSolutionFailed: wrongFailed,
      reference: summarize(ref.perTest), ...(wrongPerTest ? { wrong: summarize(wrongPerTest) } : {}),
      message: passed ? 'Validation passed. The question can now be published.' : (!referencePassed
        ? 'The reference solution fails some tests, so the tests or the solution are wrong.'
        : 'The wrong solution passes every test, so the tests are too weak.'),
    });
  } catch (error) {
    if (error instanceof ExecutionUnavailableError) return fail(res, 503, 'Code execution is currently unavailable. Nothing was validated.', { verdict: 'unavailable' });
    if (error instanceof UnsupportedLanguageError) return fail(res, 400, error.message);
    throw error;
  }
};

// ---- status ----
const publishProblem = async (q) => {
  if (!q.title) return 'A title is required';
  if (AUTO_CODE_TYPES.includes(q.type)) {
    const tests = await questionRepo.listTests(q._id);
    if (!tests.length) return 'Add at least one test case';
    if (!tests.some((t) => t.visible)) return 'At least one test must be visible to students';
    if (!q.validation?.passed || q.validation.contentHash !== contentHash(q, tests)) {
      return 'Run validation first: the reference solution must pass every test (and the wrong solution must fail at least one) for the current content';
    }
  } else if (q.type === 'mcq') {
    if ((q.options || []).length < 2) return 'A multiple choice question needs at least two options';
    if (!(q.correct || []).length || !q.correct.every((n) => Number.isInteger(n) && n >= 0 && n < q.options.length)) return 'Mark the correct option(s)';
  } else if (q.type === 'trace') {
    if (!q.traceAnswer?.trim()) return 'A trace question needs the expected output';
  }
  return null;
};

export const setStatus = async (req, res) => {
  const q = await loadEditable(req, res);
  if (!q) return;
  const next = req.body?.status;
  if (!QUESTION_STATUSES.includes(next)) return fail(res, 400, `status must be one of ${QUESTION_STATUSES.join(', ')}`);
  if (!(TRANSITIONS[q.status] || []).includes(next)) return fail(res, 409, `Cannot move a ${q.status} question to ${next}`);
  const patch = { status: next };
  if (next === 'published') {
    const problem = await publishProblem(q);
    if (problem) return fail(res, 409, problem, { code: 'PUBLISH_BLOCKED' });
    const tests = AUTO_CODE_TYPES.includes(q.type) ? await questionRepo.listTests(q._id) : [];
    const hash = contentHash(q, tests);
    patch.version = q.publishedHash && q.publishedHash !== hash ? q.version + 1 : q.version;
    patch.publishedHash = hash;
  }
  const updated = await questionRepo.updateQuestion(institutionOf(req), q._id, patch);
  await audit({ actor: req.user.id, action: 'question.status', target: q._id, institutionId: institutionOf(req), meta: { status: next } });
  await respond(res, updated);
};

// ---- rubric ----
const cleanCriteria = (v) => {
  if (!Array.isArray(v) || !v.length || v.length > 20) return null;
  const out = [];
  for (const c of v) {
    if (!c || typeof c.name !== 'string' || !c.name.trim() || !Number.isFinite(c.maxPoints) || c.maxPoints < 0 || c.maxPoints > 100) return null;
    const levels = Array.isArray(c.levels) ? c.levels.slice(0, 8).map((l) => ({
      label: str(l?.label, 80) || '', points: num(l?.points, 0, c.maxPoints) ?? 0, description: str(l?.description, 500) || '',
    })) : [];
    out.push({ name: c.name.trim().slice(0, 120), description: str(c.description, 1000) || '', maxPoints: c.maxPoints, levels });
  }
  return out;
};

export const getRubric = async (req, res) => {
  const q = await loadVisible(req, res);
  if (!q) return;
  const r = await questionRepo.getRubric(institutionOf(req), q._id);
  res.json({ success: true, rubric: r ? { criteria: r.criteria } : null });
};

export const putRubric = async (req, res) => {
  const q = await loadEditable(req, res);
  if (!q) return;
  if (!['short', 'behavioural'].includes(q.type)) return fail(res, 400, 'Rubrics are for short and behavioural questions');
  const criteria = cleanCriteria(req.body?.criteria);
  if (!criteria) return fail(res, 400, 'criteria must be 1-20 items with a name and maxPoints');
  const r = await questionRepo.saveRubric(institutionOf(req), q._id, criteria);
  res.json({ success: true, rubric: { criteria: r.criteria } });
};

export const deleteRubric = async (req, res) => {
  const q = await loadEditable(req, res);
  if (!q) return;
  await questionRepo.deleteRubric(institutionOf(req), q._id);
  res.json({ success: true });
};

// ---- AI drafting ----
export const draftWithAi = async (req, res) => {
  const { topic, difficulty, language } = req.body || {};
  const count = req.body?.count === undefined ? 1 : req.body.count;
  if (typeof topic !== 'string' || !topic.trim() || topic.length > 100) return fail(res, 400, 'topic is required');
  if (!DIFFICULTIES.includes(difficulty)) return fail(res, 400, `difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  const lang = normalizeLanguage(language);
  if (!lang) return fail(res, 400, 'Unsupported language');
  if (!Number.isInteger(count) || count < 1 || count > 3) return fail(res, 400, 'count must be 1 to 3');
  let drafts;
  try {
    drafts = await draftQuestions({ topic: topic.trim(), difficulty, language: lang, count }); // meters the university AI cap
  } catch (error) {
    if (error?.code === 'AI_MONTHLY_CAP') throw error;
    console.error('AI drafting failed:', error.message);
    return fail(res, 502, 'The AI could not produce a usable draft. Try again.');
  }
  if (!drafts.length) return fail(res, 502, 'The AI could not produce a usable draft. Try again.');
  const institutionId = institutionOf(req);
  const created = [];
  for (const d of drafts) {
    const q = await questionRepo.createQuestion({
      institutionId, authorId: req.user.id, source: 'ai_drafted', status: 'draft', version: 1, type: 'coding',
      title: d.title, statement: d.statement, topic: [topic.trim()], difficulty, languages: [lang],
      starterCode: d.starterCode ? { [lang]: d.starterCode } : {}, referenceSolution: { language: lang, source: d.referenceSolution },
      wrongSolution: { language: lang, source: d.wrongSolution },
    });
    for (const [order, t] of d.tests.entries()) {
      await questionRepo.addTest({ institutionId, questionId: q._id, input: t.input, expectedOutput: t.expectedOutput, visible: t.visible, weight: 1, comparison: 'trim', order });
    }
    created.push(staffQuestion(q, await questionRepo.listTests(q._id), { editable: true }));
  }
  res.status(201).json({ success: true, questions: created, note: 'Drafts only. Run validation, review, then publish.' });
};
