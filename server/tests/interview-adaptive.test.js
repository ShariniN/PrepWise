// Adaptive 5-question mock interview: one AI call builds a pool of 12 questions (4 slots x 3 levels), the coding
// slot comes from the seeded practice set, and each answer moves the next question up or down a level.
// No database and no real AI: the interview model, the practice repo and the AI seam are stubbed.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import InterviewModel from '../models/Interview.js';
import practiceRepo from '../modules/practice/practice.repo.js';
import { interviewAi } from '../modules/interviews/interviews.controller.js';
import { nextLevel, startLevelFor, SLOT_TYPES, LEVELS, READINESS_LEVEL } from '../modules/interviews/interviews.adaptive.js';
import { buildPool } from '../modules/interviews/interviews.pool.js';
import { fallbackSlot } from '../modules/interviews/interviews.questions.js';
import { installAnswerClaims } from './support/interviewClaims.js';
import app from '../app.js';

// ---------------------------------------------------------------- pure rules

test('nextLevel steps up at 75, down below 45, clamps', () => {
  assert.equal(nextLevel('easy', 75), 'medium');
  assert.equal(nextLevel('hard', 90), 'hard');
  assert.equal(nextLevel('medium', 44), 'easy');
  assert.equal(nextLevel('easy', 10), 'easy');
  assert.equal(nextLevel('medium', 60), 'medium');
  assert.equal(nextLevel('medium', null), 'medium');
  assert.equal(nextLevel('medium', 45), 'medium');
  assert.equal(nextLevel('hard', 0), 'medium');
});

test('startLevelFor uses previous levelReached over readiness', () => {
  assert.equal(startLevelFor({ previousLevelReached: 'hard', readiness: 'just_starting' }), 'hard');
  assert.equal(startLevelFor({ previousLevelReached: null, readiness: 'just_starting' }), 'easy');
  assert.equal(startLevelFor({ previousLevelReached: null, readiness: 'some_practice' }), 'medium');
  assert.equal(startLevelFor({ previousLevelReached: undefined, readiness: 'ready' }), 'hard');
  assert.equal(startLevelFor({ previousLevelReached: null, readiness: 'nonsense' }), null);
  assert.equal(startLevelFor({}), null);
});

test('slot order and readiness levels are the agreed ones', () => {
  assert.deepEqual(SLOT_TYPES, ['behavioral', 'technical', 'coding', 'technical', 'behavioral']);
  assert.deepEqual(LEVELS, ['easy', 'medium', 'hard']);
  assert.deepEqual(READINESS_LEVEL, { just_starting: 'easy', some_practice: 'medium', ready: 'hard' });
});

// ---------------------------------------------------------------- pool

const aiSlot = (slot) => Object.fromEntries(LEVELS.map((l) => [l, { question: `AI slot ${slot} ${l}: tell me about your Node.js work at this level?`, category: `cat${slot}` }]));
const FULL_POOL = { slots: { 0: aiSlot(0), 1: aiSlot(1), 3: aiSlot(3), 4: aiSlot(4) } };

test('buildPool makes exactly one AI call', async () => {
  for (const reply of [JSON.stringify(FULL_POOL), 'not json at all', '{"slots":{"0":{}}}']) {
    const calls = [];
    const generate = async (prompt) => { calls.push(prompt); return { text: reply, model: 'stub' }; };
    await buildPool({ resumeText: 'CV with Node.js', role: { title: 'Software engineer intern', description: 'd', skills: ['Git'] }, generate });
    assert.equal(calls.length, 1, reply);
  }
});

test('buildPool with a full AI reply covers slots 0, 1, 3, 4 at three levels and uses no fallback', async () => {
  let prompt = '';
  const { pool, usedFallbackQuestions } = await buildPool({
    resumeText: 'Amara CV: Node.js REST API project', role: { title: 'Software engineer intern', description: 'Builds features', skills: ['Git', 'SQL'] },
    jobDescription: 'Backend intern at Acme', generate: async (p) => { prompt = p; return { text: `\`\`\`json\n${JSON.stringify(FULL_POOL)}\n\`\`\``, model: 'stub' }; },
  });
  assert.equal(usedFallbackQuestions, false);
  assert.deepEqual(Object.keys(pool).sort(), ['0', '1', '3', '4']);
  for (const slot of ['0', '1', '3', '4']) {
    for (const level of LEVELS) {
      const q = pool[slot][level];
      assert.deepEqual(Object.keys(q).sort(), ['category', 'expectedDuration', 'question', 'questionId', 'type']);
      assert.equal(q.type, SLOT_TYPES[slot]);
      assert.match(q.question, new RegExp(`AI slot ${slot} ${level}`));
    }
  }
  const ids = Object.values(pool).flatMap((s) => Object.values(s).map((q) => q.questionId));
  assert.equal(new Set(ids).size, 12, 'questionIds are unique');
  for (const part of ['Amara CV', 'Software engineer intern', 'Git, SQL', 'Backend intern at Acme']) assert.ok(prompt.includes(part), part);
});

test('invalid AI JSON fills missing slots from the fallback pool and flags usedFallbackQuestions', async () => {
  const partial = { slots: { 0: aiSlot(0), 1: aiSlot(1), 3: { easy: { question: 'only one level here, is that enough?' } } } };
  const r = await buildPool({ resumeText: 'cv', role: { title: 'R', description: 'd', skills: [] }, generate: async () => ({ text: JSON.stringify(partial) }) });
  assert.equal(r.usedFallbackQuestions, true);
  assert.match(r.pool[0].easy.question, /AI slot 0 easy/);
  assert.match(r.pool[1].hard.question, /AI slot 1 hard/);
  assert.deepEqual(r.pool[3], fallbackSlot(3));
  assert.deepEqual(r.pool[4], fallbackSlot(4));

  for (const generate of [async () => { throw new Error('All AI models failed'); }, async () => ({ text: 'not json at all' }), async () => 'Sorry, I cannot help {with} that']) {
    const broken = await buildPool({ resumeText: 'cv', role: { title: 'R', description: 'd', skills: [] }, generate });
    assert.equal(broken.usedFallbackQuestions, true);
    for (const slot of [0, 1, 3, 4]) assert.deepEqual(broken.pool[slot], fallbackSlot(slot), `slot ${slot} comes from the fallback pool`);
  }
});

test('the fallback pool has 12 distinct questions with unique ids', () => {
  const all = [0, 1, 3, 4].flatMap((s) => LEVELS.map((l) => fallbackSlot(s)[l]));
  assert.equal(all.length, 12);
  assert.equal(new Set(all.map((q) => q.question)).size, 12);
  assert.equal(new Set(all.map((q) => q.questionId)).size, 12);
  for (const s of [0, 1, 3, 4]) for (const l of LEVELS) assert.equal(fallbackSlot(s)[l].type, SLOT_TYPES[s]);
});

// ---------------------------------------------------------------- endpoints
const ROLE_ID = 'cccccccccccccccccccccccc';
const CV = 'Amara Adams. BSc Computer Science. Built a REST API in Node.js with MongoDB and Jest tests. Skills: JavaScript, Git.';
const same = (a, b) => String(a) === String(b);

let w, student, store, previous, scores, aiCalls, bank, testsByQuestion, calls;
beforeEach(() => {
  w = makeWorld(); w.install();
  w.institutions[IDS.instA].targetRoles = [{ _id: ROLE_ID, title: 'Software engineer intern', description: 'Builds features', skills: ['JavaScript', 'Git'] }];
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA, targetRoleId: ROLE_ID, currentCV: { text: CV, fileName: 'cv.pdf' } });
  store = []; previous = []; aiCalls = []; scores = []; calls = { score: 0, overall: 0 };

  // Honours the filter the controller sends, institution included, so an unscoped lookup finds nothing.
  mock.method(InterviewModel, 'findOne', async (filter) => {
    if (filter._id) return store.find((d) => same(d._id, filter._id) && same(d.userId, filter.userId) && same(d.institutionId, filter.institutionId)) || null;
    return previous.find((d) => same(d.userId, filter.userId) && d.status === 'completed' && d.levelReached) || null;
  });
  mock.method(InterviewModel.prototype, 'save', async function save() { if (!store.includes(this)) store.push(this); return this; });
  installAnswerClaims((id) => store.find((d) => same(d._id, id)) || null);

  mock.method(interviewAi, 'generate', async (prompt) => { aiCalls.push(prompt); return { text: JSON.stringify(FULL_POOL), model: 'stub' }; });
  mock.method(interviewAi, 'scoreAnswer', async () => {
    calls.score += 1;
    await new Promise((r) => setTimeout(r, 5)); // scoring takes time: concurrent submits overlap here
    const s = scores.shift();
    if (s === 'down') throw new Error('AI unavailable');
    return { score: s ?? 60, strengths: [], improvements: [] };
  });
  mock.method(interviewAi, 'overallFeedback', async () => (calls.overall += 1, { score: 70, feedback: { readinessLevel: 'Nearly Ready', strengths: [], improvements: [], recommendations: ['r'], generalFeedback: 'g' } }));

  bank = [];
  testsByQuestion = {};
  mock.method(practiceRepo, 'findCodingQuestion', async ({ institutionId, difficulty, language }) => {
    assert.ok(institutionId, 'scoped by institution');
    return bank.find((q) => q.difficulty === difficulty && q.languages.includes(language)) || null;
  });
  mock.method(practiceRepo, 'listTests', async (id) => testsByQuestion[String(id)] || []);
  for (const k of ['error', 'log', 'warn']) mock.method(console, k, () => {});
});
afterEach(() => mock.restoreAll());

const as = () => ({ Cookie: w.cookie(student) });
const create = (body = {}) => request(app).post('/api/interviews/create').set(as()).send(body);
const answer = (id, questionId, body = {}) => request(app).post(`/api/interviews/${id}/submit-answer`).set(as())
  .send({ questionId, responseText: 'I built a REST API with Node.js and wrote tests for every route.', answerMode: 'text', responseTime: 30, ...body });

const addCoding = (difficulty, title = `Coding ${difficulty}`) => {
  const q = { _id: newId(), title, statement: `Solve the ${difficulty} problem.`, difficulty, type: 'coding', languages: ['javascript', 'python', 'java'], starterCode: { python: 'print(0)' }, timeLimitMs: 2000, topic: ['arrays'] };
  bank.push(q);
  testsByQuestion[q._id] = [
    { _id: newId(), questionId: q._id, input: '2', expectedOutput: '4', visible: true, comparison: 'trim' },
    { _id: newId(), questionId: q._id, input: '7', expectedOutput: 'HIDDEN_EXPECTED_14', visible: false, comparison: 'trim' },
  ];
  return q;
};

test('first interview without readiness is 400 READINESS_REQUIRED', async () => {
  const res = await create({});
  assert.equal(res.status, 400, res.text);
  assert.equal(res.body.code, 'READINESS_REQUIRED');
  assert.equal(aiCalls.length, 0, 'no AI call before validation');
  assert.equal(store.length, 0);
});

test('create without CV is 409 CV_REQUIRED', async () => {
  student.currentCV = { text: '   ' };
  const res = await create({ readiness: 'ready' });
  assert.equal(res.status, 409, res.text);
  assert.equal(res.body.code, 'CV_REQUIRED');
  assert.equal(aiCalls.length, 0);
});

test('create without a target role is 409 TARGET_ROLE_REQUIRED', async () => {
  student.targetRoleId = null;
  const res = await create({ readiness: 'ready' });
  assert.equal(res.status, 409, res.text);
  assert.equal(res.body.code, 'TARGET_ROLE_REQUIRED');
  student.targetRoleId = newId(); // a role that is not in the institution's list
  const res2 = await create({ readiness: 'ready' });
  assert.equal(res2.body.code, 'TARGET_ROLE_REQUIRED');
  assert.equal(aiCalls.length, 0);
});

test('create stores pool, returns only slot 0', async () => {
  const res = await create({ readiness: 'some_practice', jobDescription: '  Backend intern at Acme  ' });
  assert.equal(res.status, 201, res.text);
  assert.equal(aiCalls.length, 1);
  const { interview, usedFallbackQuestions } = res.body;
  assert.equal(usedFallbackQuestions, false);
  assert.equal(interview.totalSlots, 5);
  assert.equal(interview.startLevel, 'medium');
  assert.equal(interview.questions.length, 1);
  assert.equal(interview.questions[0].slot, 0);
  assert.equal(interview.questions[0].level, 'medium');
  assert.equal(interview.questions[0].question, FULL_POOL.slots[0].medium.question);
  assert.ok(!JSON.stringify(res.body).includes('AI slot 1'), 'no other pool question reaches the client');
  assert.ok(!('pool' in interview));

  const saved = store[0];
  assert.equal(saved.startLevel, 'medium');
  assert.equal(saved.readiness, 'some_practice');
  assert.equal(String(saved.targetRoleId), ROLE_ID);
  assert.equal(saved.resumeText, CV);
  assert.equal(saved.jobDescription, 'Backend intern at Acme');
  assert.equal(saved.totalQuestions, 5);
  assert.deepEqual(Object.keys(saved.pool).sort(), ['0', '1', '3', '4']);
  assert.ok(aiCalls[0].includes('Backend intern at Acme') && aiCalls[0].includes('Software engineer intern'));
});

test('create uses the previous levelReached and needs no readiness after the first interview', async () => {
  previous.push({ userId: student._id, status: 'completed', levelReached: 'hard' });
  const res = await create({});
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.interview.startLevel, 'hard');
  assert.equal(res.body.interview.questions[0].level, 'hard');
  assert.equal(store[0].jobDescription.startsWith('Software engineer intern'), true, 'the role stands in for a job description');
});

test('setup says whether readiness is needed, and what is on file', async () => {
  let res = await request(app).get('/api/interviews/setup').set(as());
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.firstInterview, true);
  assert.equal(res.body.cv.onFile, true);
  assert.equal(res.body.cv.fileName, 'cv.pdf');
  assert.deepEqual(res.body.targetRole, { id: ROLE_ID, title: 'Software engineer intern' });
  previous.push({ userId: student._id, status: 'completed', levelReached: 'easy' });
  student.currentCV = null;
  res = await request(app).get('/api/interviews/setup').set(as());
  assert.equal(res.body.firstInterview, false);
  assert.equal(res.body.startLevel, 'easy');
  assert.equal(res.body.cv.onFile, false);
});

test('GET never returns pool or unasked questions', async () => {
  const c = await create({ readiness: 'just_starting' });
  const res = await request(app).get(`/api/interviews/${c.body.interview.id}`).set(as());
  assert.equal(res.status, 200, res.text);
  assert.ok(!('pool' in res.body.interview));
  assert.equal(res.body.interview.questions.length, 1);
  const text = JSON.stringify(res.body);
  for (const slot of [1, 3, 4]) assert.ok(!text.includes(`AI slot ${slot}`), `slot ${slot} leaked`);
  assert.ok(!text.includes('AI slot 0 medium') && !text.includes('AI slot 0 hard'));
});

test('submit appends next slot at the adapted level', async () => {
  const c = await create({ readiness: 'some_practice' });
  const id = c.body.interview.id;
  scores.push(80);
  const res = await answer(id, c.body.interview.questions[0].questionId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.feedback.score, 80);
  assert.equal(res.body.level, 'hard');
  assert.equal(res.body.done, false);
  assert.equal(res.body.nextQuestion.slot, 1);
  assert.equal(res.body.nextQuestion.level, 'hard');
  assert.equal(res.body.nextQuestion.question, FULL_POOL.slots[1].hard.question);
  assert.equal(store[0].questions.length, 2);
  assert.equal(store[0].responses[0].level, 'medium');

  scores.push(30);
  const res2 = await answer(id, res.body.nextQuestion.questionId);
  assert.equal(res2.body.level, 'medium', 'a low score moves down');
});

test('fallback-scored answer keeps the level', async () => {
  const c = await create({ readiness: 'ready' });
  scores.push('down');
  const res = await answer(c.body.interview.id, c.body.interview.questions[0].questionId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.feedback.source, 'fallback');
  assert.equal(res.body.level, 'hard');
  assert.equal(res.body.nextQuestion.level, 'hard');
});

test('a skipped answer counts as score 0', async () => {
  const c = await create({ readiness: 'some_practice' });
  const res = await answer(c.body.interview.id, c.body.interview.questions[0].questionId, { skipped: true });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.level, 'easy');
  assert.equal(res.body.nextQuestion.slot, 1);
  assert.equal(res.body.nextQuestion.level, 'easy');
});

const toCodingSlot = async (readiness, firstTwo = [60, 60]) => {
  const c = await create({ readiness });
  const id = c.body.interview.id;
  scores.push(...firstTwo);
  const a = await answer(id, c.body.interview.questions[0].questionId);
  const b = await answer(id, a.body.nextQuestion.questionId);
  assert.equal(b.status, 200, b.text);
  return { id, res: b };
};

test('slot 2 is a seeded coding question at the level, nearest level when none', async () => {
  const medium = addCoding('medium');
  addCoding('easy');
  const { res } = await toCodingSlot('some_practice');
  const q = res.body.nextQuestion;
  assert.equal(q.slot, 2);
  assert.equal(q.type, 'coding');
  assert.equal(q.level, 'medium');
  assert.equal(q.question, medium.title);
  assert.equal(q.statement, medium.statement);
  assert.equal(String(q.practiceQuestionId), String(medium._id));
  assert.deepEqual(q.languages, ['javascript', 'python', 'java']);
  assert.equal(q.language, 'python');
  assert.deepEqual(q.visibleTests.map((t) => [t.input, t.expectedOutput]), [['2', '4']]);
  assert.equal(q.hiddenTestCount, 1);
  assert.ok(!JSON.stringify(res.body).includes('HIDDEN_EXPECTED_14'), 'hidden tests stay on the server');
  assert.ok(!JSON.stringify(store[0].questions).includes('HIDDEN_EXPECTED_14'), 'hidden tests are not copied onto the interview');

  // no hard question in the bank: the nearest level (medium) is used
  store.length = 0;
  const { res: hardRes } = await toCodingSlot('ready', [90, 90]);
  assert.equal(hardRes.body.nextQuestion.level, 'medium');
  assert.equal(hardRes.body.nextQuestion.question, medium.title);
});

test('answering the same question twice is 409 ALREADY_ANSWERED and level moves once', async () => {
  const c = await create({ readiness: 'just_starting' });
  const id = c.body.interview.id;
  const qid = c.body.interview.questions[0].questionId;
  scores.push(90, 90);
  const first = await answer(id, qid);
  assert.equal(first.body.level, 'medium');
  const again = await answer(id, qid);
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body.code, 'ALREADY_ANSWERED');
  assert.equal(store[0].responses.length, 1);
  assert.equal(store[0].questions.length, 2);
  assert.equal(store[0].questions[1].level, 'medium');
  const skipAgain = await answer(id, qid, { skipped: true });
  assert.equal(skipAgain.status, 409);
});

test('after slot 4 status is completed and levelReached is set', async () => {
  addCoding('easy'); addCoding('medium'); addCoding('hard');
  const c = await create({ readiness: 'some_practice' });
  const id = c.body.interview.id;
  let q = c.body.interview.questions[0];
  const plan = [80, 60, 'skip', 90, 50]; // medium -> hard -> hard -> (skip: 0) medium -> hard -> stays hard
  const levels = [];
  let last;
  for (const step of plan) {
    levels.push(q.level);
    if (step === 'skip') last = await answer(id, q.questionId, { skipped: true });
    else { scores.push(step); last = await answer(id, q.questionId); }
    assert.equal(last.status, 200, last.text);
    q = last.body.nextQuestion;
  }
  assert.deepEqual(levels, ['medium', 'hard', 'hard', 'medium', 'hard']);
  assert.equal(last.body.done, true);
  assert.equal(last.body.nextQuestion, null);
  assert.equal(last.body.level, 'hard');
  const saved = store[0];
  assert.equal(saved.status, 'completed');
  assert.equal(saved.levelReached, 'hard');
  assert.ok(saved.completedAt instanceof Date);
  assert.ok(saved.overallFeedback, 'overall feedback is written when the last answer completes the interview');
  assert.deepEqual(saved.questions.map((x) => x.slot), [0, 1, 2, 3, 4]);

  const done = await request(app).put(`/api/interviews/${id}/complete`).set(as());
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.results.levelReached, 'hard');
  const fb = await request(app).get(`/api/interviews/${id}/feedback`).set(as());
  assert.equal(fb.body.feedback.levelReached, 'hard');
  assert.equal(fb.body.feedback.startLevel, 'medium');
  assert.deepEqual(fb.body.feedback.responses.map((r) => r.level), ['medium', 'hard', 'hard', 'medium', 'hard']);
  const late = await answer(id, q?.questionId || 's9-easy');
  assert.notEqual(late.status, 200);
});

// ---------------------------------------------------------------- fixes: start, concurrency, completion

test('start never sends hidden tests of an older interview', async () => {
  const legacy = new InterviewModel({
    userId: student._id, institutionId: IDS.instA, jobDescription: 'JD', resumeText: 'CV', status: 'created',
    questions: [{ questionId: 'c1', type: 'coding', question: 'Double it', category: 'c', difficulty: 'easy', tests: [{ input: '2', expectedOutput: 'CANARY_EXPECTED_OUTPUT' }] }],
  });
  store.push(legacy);
  const res = await request(app).put(`/api/interviews/${legacy._id}/start`).set(as());
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.firstQuestion.questionId, 'c1');
  assert.equal(res.body.questions.length, 1);
  assert.ok(!JSON.stringify(res.body).includes('CANARY_EXPECTED_OUTPUT'), 'hidden expected output leaked');
  assert.ok(!('tests' in res.body.firstQuestion));
});

test('two submits of the same answer at the same time are stored, scored and stepped once', async () => {
  const c = await create({ readiness: 'some_practice' });
  const id = c.body.interview.id;
  const qid = c.body.interview.questions[0].questionId;
  scores.push(80, 80);
  const [a, b] = await Promise.all([answer(id, qid), answer(id, qid)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], `${a.text} | ${b.text}`);
  assert.equal([a, b].find((r) => r.status === 409).body.code, 'ALREADY_ANSWERED');
  assert.equal(calls.score, 1, 'scored once');
  assert.equal(store[0].responses.length, 1);
  assert.equal(store[0].questions.length, 2, 'one next question appended');
  assert.equal(store[0].questions[1].level, 'hard', 'one level step');
});

test('two submits of the last answer at the same time finalise the interview once', async () => {
  addCoding('easy'); addCoding('medium'); addCoding('hard');
  const c = await create({ readiness: 'some_practice' });
  const id = c.body.interview.id;
  let q = c.body.interview.questions[0];
  for (let n = 0; n < 4; n++) q = (await answer(id, q.questionId, { skipped: true })).body.nextQuestion;
  assert.equal(q.slot, 4);
  scores.push(90, 90);
  const both = await Promise.all([answer(id, q.questionId), answer(id, q.questionId)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  assert.equal(calls.overall, 1, 'finalised once');
  assert.equal(store[0].responses.length, 5);
  assert.equal(store[0].status, 'completed');
  assert.equal(store[0].levelReached, 'medium', 'easy after four skips, one step up');
});

test('after PUT /complete the pending question is 409 INTERVIEW_COMPLETED and levelReached does not change', async () => {
  const c = await create({ readiness: 'some_practice' });
  const id = c.body.interview.id;
  scores.push(90);
  const first = await answer(id, c.body.interview.questions[0].questionId);
  const pending = first.body.nextQuestion;
  const done = await request(app).put(`/api/interviews/${id}/complete`).set(as());
  assert.equal(done.status, 200, done.text);
  const reached = store[0].levelReached;
  assert.equal(reached, 'hard');
  scores.push(10);
  const late = await answer(id, pending.questionId);
  assert.equal(late.status, 409, late.text);
  assert.equal(late.body.code, 'INTERVIEW_COMPLETED');
  assert.equal(late.body.message, 'This interview is finished.');
  assert.equal(store[0].levelReached, reached);
  assert.equal(store[0].responses.length, 1);
  assert.equal(calls.score, 1, 'the late answer is not scored');
});

test('when recording an answer fails, its claim is released and the answer can be sent again', async () => {
  const c = await create({ readiness: 'some_practice' });
  const id = c.body.interview.id;
  const qid = c.body.interview.questions[0].questionId;
  InterviewModel.prototype.save.mock.mockImplementationOnce(async () => { throw new Error('database unavailable'); });
  const failed = await answer(id, qid);
  assert.equal(failed.status, 500, failed.text);
  assert.deepEqual([...(store[0].claimedAnswers || [])], [], 'claim released');
  store[0].responses.splice(0); // the failed save stored nothing in the database
  store[0].questions.splice(1);
  const again = await answer(id, qid);
  assert.equal(again.status, 200, again.text);
  assert.equal(store[0].responses.length, 1);
});
