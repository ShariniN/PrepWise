// Mock interview coding answers: the server re-runs the code and ignores whatever the browser claims.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import InterviewModel from '../models/Interview.js';
import { usageRepo, resetAiCapCache } from '../services/aiUsage.js';
import * as exec from '../services/execution/index.js';
import { VmProvider } from './support/vmChecker.js';
import practiceRepo from '../modules/practice/practice.repo.js';
import { installAnswerClaims } from './support/interviewClaims.js';
import app from '../app.js';

let w, student, interview, provider, aiPrompts;
beforeEach(() => {
  resetAiCapCache();
  process.env.AI_PROVIDER = 'huggingface'; process.env.HF_API_TOKEN = 'test-token';
  w = makeWorld(); w.install();
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  provider = new VmProvider();
  exec.resetCache(); exec.setProvider(provider);
  interview = {
    _id: 'i1', userId: student._id, status: 'created', currentQuestionIndex: 0, responses: [],
    questions: [
      { questionId: 'c1', question: 'Print hello', type: 'coding' },
      { questionId: 'c2', question: 'Double the input', type: 'coding', tests: [{ input: '2', expectedOutput: '4' }, { input: '7', expectedOutput: '14' }] },
    ],
    async save() { return this; },
  };
  mock.method(InterviewModel, 'findOne', async () => interview);
  installAnswerClaims((id) => (String(id) === String(interview._id) ? interview : null));
  mock.method(usageRepo, 'increment', async () => ({ calls: 1 }));
  mock.method(usageRepo, 'getCap', async () => 100);
  aiPrompts = [];
  mock.method(axios, 'post', async (url, body) => {
    aiPrompts.push(JSON.stringify(body));
    return { data: { generated_text: JSON.stringify({ score: 70, strengths: ['ok'], improvements: ['more'], detailedAnalysis: 'a', overallAssessment: 'b' }) } };
  });
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); delete process.env.AI_PROVIDER; delete process.env.HF_API_TOKEN; });

const answer = (body) => request(app).post('/api/interviews/i1/submit-answer').set('Cookie', w.cookie(student))
  .send({ responseText: 'My approach is below, explained in enough words.', answerMode: 'text', responseTime: 30, language: 'javascript', ...body });

const FAKE_CLAIM = { success: true, output: 'FORGED_OUTPUT', error: '', executionTime: '0.001', memory: '1' };

test('client-sent executionResults are ignored: the server runs the code and records its own result', async () => {
  const res = await answer({ questionId: 'c1', code: 'throw new Error("boom")', executionResults: FAKE_CLAIM });
  assert.equal(res.status, 200, res.text);
  const saved = interview.responses[0].executionResults;
  assert.equal(saved.success, false);
  assert.equal(saved.verdict, 'runtime_error');
  assert.equal(saved.serverVerified, true);
  assert.ok(!JSON.stringify(interview.responses[0]).includes('FORGED_OUTPUT'));
  assert.ok(!aiPrompts.join('').includes('FORGED_OUTPUT'));
  assert.equal(interview.responses[0].feedback.executionSource, 'server');
  assert.equal(provider.calls, 1);
});

test('questions without tests run once with no stdin and record the real output', async () => {
  const res = await answer({ questionId: 'c1', code: 'console.log("hello")', executionResults: { success: false } });
  assert.equal(res.status, 200, res.text);
  const saved = interview.responses[0].executionResults;
  assert.equal(saved.success, true);
  assert.equal(saved.output, 'hello\n');
  assert.equal(saved.verdict, 'accepted');
});

test('questions with tests are marked against them and the tests never reach the client', async () => {
  const right = await answer({ questionId: 'c2', code: 'const n=parseInt(require("fs").readFileSync(0,"utf8"),10);console.log(n*2)' });
  assert.equal(right.status, 200, right.text);
  assert.equal(interview.responses[0].executionResults.testsPassed, 2);
  assert.equal(interview.responses[0].executionResults.success, true);
  interview.responses = []; interview.claimedAnswers = []; // the same question can be answered only once
  const wrong = await answer({ questionId: 'c2', code: 'console.log(0)', executionResults: FAKE_CLAIM });
  assert.equal(wrong.status, 200);
  assert.equal(interview.responses[0].executionResults.success, false);
  assert.equal(interview.responses[0].executionResults.testsPassed, 0);
  assert.ok(!JSON.stringify(wrong.body).includes('expectedOutput'));
});

test('sandbox outage: executionResults.unavailable=true, no fabricated success, no result given to the AI', async () => {
  provider.down = true;
  const res = await answer({ questionId: 'c1', code: 'console.log(1)', executionResults: FAKE_CLAIM });
  assert.equal(res.status, 200, res.text);
  const saved = interview.responses[0].executionResults;
  assert.equal(saved.unavailable, true);
  assert.equal(saved.success, false);
  assert.equal(saved.serverVerified, false);
  assert.equal(saved.output, undefined);
  assert.equal(interview.responses[0].feedback.executionSource, 'unavailable');
  assert.ok(!aiPrompts.join('').includes('CODE EXECUTION RESULT'));
});

test('non-coding answers are untouched by the execution path', async () => {
  interview.questions.push({ questionId: 'b1', question: 'Tell me', type: 'behavioral' });
  const res = await answer({ questionId: 'b1', executionResults: FAKE_CLAIM });
  assert.equal(res.status, 200, res.text);
  assert.equal(interview.responses[0].executionResults, null);
  assert.equal(provider.calls, 0);
});

test('the adaptive coding slot is marked against all of its practice question tests, loaded on the server', async () => {
  const practiceQuestionId = 'dddddddddddddddddddddddd';
  const loaded = [];
  mock.method(practiceRepo, 'listTests', async (id) => {
    loaded.push(String(id));
    return [
      { _id: 't1', input: '2', expectedOutput: '4', visible: true, comparison: 'trim' },
      { _id: 't2', input: '7', expectedOutput: '14', visible: false, comparison: 'trim' },
      { _id: 't3', input: '10', expectedOutput: '20', visible: false, comparison: 'trim' },
    ];
  });
  interview.questions.push({
    questionId: 's2-easy', slot: 2, level: 'easy', type: 'coding', question: 'Double it', statement: 'Read n, print 2n.',
    practiceQuestionId, languages: ['javascript', 'python', 'java'], visibleTests: [{ id: 't1', input: '2', expectedOutput: '4' }],
    timeLimitMs: 1234, memoryLimitKb: 65536,
  });
  const limitsSeen = [];
  const run = provider.run.bind(provider);
  provider.run = async (req) => { limitsSeen.push(req.limits); return run(req); };
  const res = await answer({ questionId: 's2-easy', code: 'const n=parseInt(require("fs").readFileSync(0,"utf8"),10);console.log(n*2)' });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(loaded, [practiceQuestionId]);
  const saved = interview.responses[0].executionResults;
  assert.equal(saved.testsPassed, 3);
  assert.equal(saved.testsTotal, 3, 'hidden tests count too');
  assert.equal(saved.serverVerified, true);
  assert.ok(!JSON.stringify(res.body).includes('"14"'));
  assert.equal(limitsSeen.length, 3);
  for (const l of limitsSeen) assert.deepEqual([l.timeMs, l.memoryKb], [1234, 65536], 'the practice question limits are used');

  const cobol = await answer({ questionId: 's2-easy', code: 'x', language: 'cobol' });
  assert.equal(cobol.status, 409, 'already answered');
  interview.responses = []; interview.claimedAnswers = [];
  const bad = await answer({ questionId: 's2-easy', code: 'print(1)', language: 'cpp' });
  assert.equal(bad.status, 400, 'only the slot languages are accepted');
});

test('the basic estimate gives 0 for code that is empty or the unchanged starting code', async () => {
  mock.method(axios, 'post', async () => ({ data: { generated_text: 'Sorry, I cannot help with that right now.' } })); // AI unusable
  const starter = 'function solve(n) {\n  // TODO: write your solution here\n}\nconsole.log(solve(1));\n';
  interview.questions.push({ questionId: 's2-medium', slot: 2, level: 'medium', type: 'coding', question: 'Solve it', practiceQuestionId: 'dddddddddddddddddddddddd', languages: ['javascript', 'python', 'java'], starterCode: { javascript: starter } });
  mock.method(practiceRepo, 'listTests', async () => [{ _id: 't1', input: '1', expectedOutput: '2', visible: true }]);
  const same = await answer({ questionId: 's2-medium', code: starter.replace(/\n/g, '\n\n  '), language: 'javascript' });
  assert.equal(same.status, 200, same.text);
  assert.equal(same.body.feedback.source, 'fallback');
  assert.equal(same.body.feedback.score, 0);
  assert.match(same.body.feedback.improvements.join(' '), /No code was written/);

  interview.responses = []; interview.claimedAnswers = [];
  const written = await answer({ questionId: 's2-medium', code: 'function solve(n) { return n * 2; }\nconsole.log(solve(1));', language: 'javascript' });
  assert.equal(written.status, 200, written.text);
  assert.notEqual(written.body.feedback.score, 0, 'real code keeps the usual basic estimate');
});
