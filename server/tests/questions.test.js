// Lecturer question API: ownership, tenancy, the validation gate before publishing, AI drafting, rubrics.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import aiService from '../services/aiService.js';
import app from '../app.js';

const REF = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\nconsole.log(n * 2);';
const WRONG = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\nconsole.log(n + n + 1);';
const ALSO_RIGHT = 'const n = parseInt(require("fs").readFileSync(0,"utf8").trim(), 10);\nconsole.log(n * 2);'; // "wrong" solution that is actually right

let w, db, provider, adminA, lecA1, lecA2, lecB, stuA;
beforeEach(() => {
  w = makeWorld(); w.install(); db = installQuestionWorld(w);
  provider = new VmProvider();
  exec.resetCache(); exec.setProvider(provider);
  adminA = w.addUser({ email: 'ad@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecA1 = w.addUser({ email: 'l1@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  stuA = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

const as = (u) => ({ Cookie: w.cookie(u) });
const call = (u, method, path, body) => request(app)[method](`/api/questions${path}`).set(as(u)).send(body);

const makeCoding = async (u, extra = {}) => {
  const res = await call(u, 'post', '', {
    type: 'coding', title: 'Double it', statement: 'Print twice the number', topic: ['basics'], difficulty: 'easy', languages: ['javascript'],
    referenceSolution: { language: 'javascript', source: REF }, wrongSolution: { language: 'javascript', source: WRONG }, ...extra,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.question;
};
const addTests = async (u, id) => {
  for (const t of [{ input: '3', expectedOutput: '6', visible: true }, { input: '10', expectedOutput: '20' }, { input: '-1', expectedOutput: '-2' }]) {
    assert.equal((await call(u, 'post', `/${id}/tests`, t)).status, 201);
  }
};

test('roles: students are refused, anonymous is 401', async () => {
  assert.equal((await request(app).get('/api/questions')).status, 401);
  assert.equal((await call(stuA, 'get', '')).status, 403);
  assert.equal((await call(stuA, 'post', '/draft', {})).status, 403);
});

test('create is server-controlled: status, version, author and source cannot be set by the client', async () => {
  const q = await makeCoding(lecA1, { status: 'published', version: 9, source: 'seed', authorId: lecA2._id, institutionId: IDS.instB });
  assert.equal(q.status, 'draft');
  assert.equal(q.version, 1);
  assert.equal(q.source, 'lecturer');
  assert.equal(q.authorId, lecA1._id);
  assert.equal(q.institutionId, IDS.instA);
});

test('tenancy and ownership: lecturers edit only their own, admin edits all in the institution, nobody crosses universities', async () => {
  const q = await makeCoding(lecA1);
  assert.equal((await call(lecA2, 'put', `/${q.id}`, { title: 'Mine now' })).status, 403);
  assert.equal((await call(lecA2, 'delete', `/${q.id}`)).status, 403);
  assert.equal((await call(lecA2, 'post', `/${q.id}/tests`, { expectedOutput: '1' })).status, 403);
  assert.equal((await call(lecA2, 'get', `/${q.id}`)).status, 200); // can read within the university
  assert.equal((await call(lecB, 'get', `/${q.id}`)).status, 404);
  assert.equal((await call(lecB, 'put', `/${q.id}`, { title: 'x' })).status, 404);
  assert.equal((await call(lecB, 'post', `/${q.id}/duplicate`)).status, 404);
  assert.equal((await call(adminA, 'put', `/${q.id}`, { title: 'Renamed by admin' })).status, 200);
  const listB = await call(lecB, 'get', '');
  assert.deepEqual(listB.body.questions, []);
  const listA = await call(lecA2, 'get', '');
  assert.equal(listA.body.questions[0].editable, false);
  assert.equal((await call(lecA1, 'get', '')).body.questions[0].editable, true);
});

test('seed questions are readable by every university but not editable; duplicating makes an editable copy', async () => {
  const seed = db.addQuestion({ institutionId: null, source: 'seed', slug: 's1', title: 'Seed Q', referenceSolution: { language: 'javascript', source: REF } },
    [{ input: '1', expectedOutput: '2', visible: true }]);
  for (const u of [lecA1, lecB]) assert.equal((await call(u, 'get', `/${seed._id}`)).status, 200);
  for (const u of [lecA1, adminA]) {
    assert.equal((await call(u, 'put', `/${seed._id}`, { title: 'hack' })).status, 403);
    assert.equal((await call(u, 'delete', `/${seed._id}`)).status, 403);
    assert.equal((await call(u, 'post', `/${seed._id}/tests`, { expectedOutput: '1' })).status, 403);
    assert.equal((await call(u, 'patch', `/${seed._id}/status`, { status: 'retired' })).status, 403);
  }
  assert.equal(db.questions.find((x) => x._id === seed._id).title, 'Seed Q');
  const dup = await call(lecA1, 'post', `/${seed._id}/duplicate`);
  assert.equal(dup.status, 201);
  assert.equal(dup.body.question.institutionId, IDS.instA);
  assert.equal(dup.body.question.source, 'lecturer');
  assert.equal(dup.body.question.status, 'draft');
  assert.equal(dup.body.question.tests.length, 1);
  assert.equal((await call(lecA1, 'put', `/${dup.body.question.id}`, { title: 'Edited copy' })).status, 200);
  assert.equal(db.questions.find((x) => x._id === seed._id).title, 'Seed Q');
});

test('publish gate: blocked without a passing validation; an edit after validating blocks it until the content matches again', async () => {
  const q = await makeCoding(lecA1);
  const publish = () => call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' });
  assert.equal((await publish()).status, 409); // no tests
  await addTests(lecA1, q.id);
  const blocked = await publish();
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.message, /validation/i);

  const v = await call(lecA1, 'post', `/${q.id}/validate`, {});
  assert.equal(v.status, 200, v.text);
  assert.equal(v.body.passed, true);
  assert.equal(v.body.referencePassed, true);
  assert.equal(v.body.wrongSolutionFailed, true);

  // a content change after validation invalidates it
  const t = (await call(lecA1, 'get', `/${q.id}/tests`)).body.tests[1];
  assert.equal((await call(lecA1, 'put', `/${q.id}/tests/${t.id}`, { expectedOutput: '21' })).status, 200);
  assert.equal((await publish()).status, 409);

  assert.equal((await call(lecA1, 'put', `/${q.id}/tests/${t.id}`, { expectedOutput: '20' })).status, 200);
  // content is back to exactly what was validated, so the old validation applies again
  assert.equal((await publish()).status, 200);
});

test('validation records against the current content and then publish succeeds; editing a live question unpublishes it and bumps the version on republish', async () => {
  const q = await makeCoding(lecA1);
  await addTests(lecA1, q.id);
  await call(lecA1, 'post', `/${q.id}/validate`, {});
  const pub = await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' });
  assert.equal(pub.status, 200, pub.text);
  assert.equal(pub.body.question.status, 'published');
  assert.equal(pub.body.question.version, 1);
  // students can now see it
  const seen = await request(app).get('/api/practice/questions').set(as(stuA));
  assert.equal(seen.body.questions.length, 1);
  // edit statement -> back to draft, must validate again, version bumps on republish
  const edit = await call(lecA1, 'put', `/${q.id}`, { statement: 'Print twice the number, new wording' });
  assert.equal(edit.body.question.status, 'draft');
  assert.equal((await request(app).get('/api/practice/questions').set(as(stuA))).body.questions.length, 0);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' })).status, 409);
  await call(lecA1, 'post', `/${q.id}/validate`, {});
  const again = await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' });
  assert.equal(again.status, 200);
  assert.equal(again.body.question.version, 2);
});

test('a wrong solution that passes every test blocks publishing; so does a failing reference solution', async () => {
  const q = await makeCoding(lecA1, { wrongSolution: { language: 'javascript', source: ALSO_RIGHT } });
  await addTests(lecA1, q.id);
  const v = await call(lecA1, 'post', `/${q.id}/validate`, {});
  assert.equal(v.body.passed, false);
  assert.equal(v.body.wrongSolutionFailed, false);
  assert.match(v.body.message, /too weak/);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' })).status, 409);

  const bad = await makeCoding(lecA1, { referenceSolution: { language: 'javascript', source: WRONG } });
  await addTests(lecA1, bad.id);
  const v2 = await call(lecA1, 'post', `/${bad.id}/validate`, { wrongSolution: { language: 'javascript', source: WRONG } });
  assert.equal(v2.body.passed, false);
  assert.equal(v2.body.referencePassed, false);
  assert.equal((await call(lecA1, 'patch', `/${bad.id}/status`, { status: 'published' })).status, 409);
});

test('validation needs the sandbox: an outage returns 503 and records nothing, so publishing stays blocked', async () => {
  const q = await makeCoding(lecA1);
  await addTests(lecA1, q.id);
  provider.down = true;
  const v = await call(lecA1, 'post', `/${q.id}/validate`, {});
  assert.equal(v.status, 503);
  assert.equal(v.body.verdict, 'unavailable');
  assert.equal(db.questions.find((x) => x._id === q.id).validation, undefined);
  provider.down = false;
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' })).status, 409);
});

test('a validation recorded for a different content hash cannot be replayed', async () => {
  const q = await makeCoding(lecA1);
  await addTests(lecA1, q.id);
  await call(lecA1, 'post', `/${q.id}/validate`, {});
  // tamper with the stored hash to simulate stale validation
  db.questions.find((x) => x._id === q.id).validation.contentHash = 'stale';
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' })).status, 409);
});

test('status transitions are restricted', async () => {
  const q = await makeCoding(lecA1);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'retired' })).status, 409);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'nonsense' })).status, 400);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'in_review' })).status, 200);
});

test('mcq and trace questions publish without the sandbox but need their answer key', async () => {
  const m = (await call(lecA1, 'post', '', { type: 'mcq', title: 'Pick', options: ['a', 'b'] })).body.question;
  assert.equal((await call(lecA1, 'patch', `/${m.id}/status`, { status: 'published' })).status, 409);
  await call(lecA1, 'put', `/${m.id}`, { correct: [1], explanation: 'b is right' });
  assert.equal((await call(lecA1, 'patch', `/${m.id}/status`, { status: 'published' })).status, 200);
  const t = (await call(lecA1, 'post', '', { type: 'trace', title: 'Trace' })).body.question;
  assert.equal((await call(lecA1, 'patch', `/${t.id}/status`, { status: 'published' })).status, 409);
  assert.equal((await call(lecA1, 'post', `/${m.id}/validate`, {})).status, 400);
});

test('deleting a question with attempts is refused; tests belong to coding questions only', async () => {
  const q = await makeCoding(lecA1);
  db.attempts.push({ _id: 'a'.repeat(24), questionId: q.id });
  assert.equal((await call(lecA1, 'delete', `/${q.id}`)).status, 409);
  const short = (await call(lecA1, 'post', '', { type: 'short', title: 'Why' })).body.question;
  assert.equal((await call(lecA1, 'post', `/${short.id}/tests`, { expectedOutput: '1' })).status, 400);
  const free = await makeCoding(lecA1);
  assert.equal((await call(lecA1, 'delete', `/${free.id}`)).status, 200);
});

test('rubrics: short and behavioural questions only, validated, tenant-scoped', async () => {
  const s = (await call(lecA1, 'post', '', { type: 'behavioural', title: 'Tell me about a conflict' })).body.question;
  const criteria = [{ name: 'Situation', description: 'Sets context', maxPoints: 3, levels: [{ label: 'Clear', points: 3 }] }, { name: 'Result', maxPoints: 2 }];
  assert.equal((await call(lecA1, 'put', `/${s.id}/rubric`, { criteria: [] })).status, 400);
  assert.equal((await call(lecA1, 'put', `/${s.id}/rubric`, { criteria: [{ name: 'x', maxPoints: 1000 }] })).status, 400);
  const saved = await call(lecA1, 'put', `/${s.id}/rubric`, { criteria });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.rubric.criteria.length, 2);
  assert.equal((await call(lecA2, 'put', `/${s.id}/rubric`, { criteria })).status, 403);
  assert.equal((await call(lecB, 'get', `/${s.id}/rubric`)).status, 404);
  assert.equal((await call(lecA2, 'get', `/${s.id}/rubric`)).body.rubric.criteria[0].name, 'Situation');
  assert.equal((await call(lecA1, 'delete', `/${s.id}/rubric`)).status, 200);
  assert.equal((await call(lecA1, 'get', `/${s.id}/rubric`)).body.rubric, null);
  const coding = await makeCoding(lecA1);
  assert.equal((await call(lecA1, 'put', `/${coding.id}/rubric`, { criteria })).status, 400);
});

const aiDraft = (n = 1) => Array.from({ length: n }, (_, i) => ({
  title: `Drafted ${i}`, statement: 'Print twice the number', starterCode: '// code',
  referenceSolution: REF, wrongSolution: WRONG,
  tests: [{ input: '2', expectedOutput: '4', visible: true }, { input: '5', expectedOutput: '10', visible: false }],
}));

test('AI drafting: drafts are status=draft source=ai_drafted, publishing needs validation, count is capped', async () => {
  mock.method(aiService, 'generateQuestionDrafts', async (args) => { assert.equal(args.language, 'javascript'); return aiDraft(2); });
  const res = await call(lecA1, 'post', '/draft', { topic: 'basics', difficulty: 'easy', language: 'javascript', count: 2 });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.questions.length, 2);
  const q = res.body.questions[0];
  assert.equal(q.status, 'draft');
  assert.equal(q.source, 'ai_drafted');
  assert.equal(q.institutionId, IDS.instA);
  assert.equal(q.tests.length, 2);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' })).status, 409);
  const v = await call(lecA1, 'post', `/${q.id}/validate`, {});
  assert.equal(v.body.passed, true);
  assert.equal((await call(lecA1, 'patch', `/${q.id}/status`, { status: 'published' })).status, 200);
  assert.equal((await call(lecA1, 'post', '/draft', { topic: 'x', difficulty: 'easy', language: 'javascript', count: 4 })).status, 400);
  assert.equal((await call(lecA1, 'post', '/draft', { topic: 'x', difficulty: 'easy', language: 'cobol', count: 1 })).status, 400);
});

test('AI drafting: unusable output is rejected, the monthly cap error passes through, and a bad AI wrong-solution is caught by the gate', async () => {
  const m1 = mock.method(aiService, 'generateQuestionDrafts', async () => [{ title: 'No tests', statement: 's' }, 'junk']);
  const none = await call(lecA1, 'post', '/draft', { topic: 'x', difficulty: 'easy', language: 'javascript' });
  assert.equal(none.status, 502);
  assert.equal(db.questions.length, 0);
  m1.mock.restore();

  const m2 = mock.method(aiService, 'generateQuestionDrafts', async () => { throw Object.assign(new Error('cap'), { code: 'AI_MONTHLY_CAP', status: 429 }); });
  const capped = await call(lecA1, 'post', '/draft', { topic: 'x', difficulty: 'easy', language: 'javascript' });
  assert.equal(capped.status, 429);
  assert.equal(capped.body.code, 'AI_MONTHLY_CAP');
  m2.mock.restore();

  const d = aiDraft(1)[0];
  d.wrongSolution = REF; // the AI's "wrong" solution is actually right: tests are too weak
  mock.method(aiService, 'generateQuestionDrafts', async () => [d]);
  const res = await call(lecA1, 'post', '/draft', { topic: 'x', difficulty: 'easy', language: 'javascript' });
  const id = res.body.questions[0].id;
  const v = await call(lecA1, 'post', `/${id}/validate`, {});
  assert.equal(v.body.passed, false);
  assert.equal((await call(lecA1, 'patch', `/${id}/status`, { status: 'published' })).status, 409);
});

test('AI drafting meters the university AI cap through aiService (single choke point)', async () => {
  const { usageRepo, resetAiCapCache } = await import('../services/aiUsage.js');
  resetAiCapCache();
  process.env.AI_PROVIDER = 'ollama';
  const axios = (await import('axios')).default;
  const increments = [];
  mock.method(usageRepo, 'increment', async (id) => { increments.push(String(id)); return { calls: 1 }; });
  mock.method(usageRepo, 'getCap', async () => 100);
  mock.method(axios, 'post', async () => ({ data: { response: JSON.stringify(aiDraft(1)) } }));
  mock.method(console, 'log', () => {});
  const res = await call(lecA1, 'post', '/draft', { topic: 'basics', difficulty: 'easy', language: 'javascript' });
  delete process.env.AI_PROVIDER;
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(increments, [IDS.instA]);
});
