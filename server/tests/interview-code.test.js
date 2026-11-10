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
import app from '../app.js';

let w, student, interview, provider, aiPrompts;
beforeEach(() => {
  resetAiCapCache();
  process.env.AI_PROVIDER = 'ollama';
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
  mock.method(usageRepo, 'increment', async () => ({ calls: 1 }));
  mock.method(usageRepo, 'getCap', async () => 100);
  aiPrompts = [];
  mock.method(axios, 'post', async (url, body) => {
    aiPrompts.push(JSON.stringify(body));
    return { data: { response: JSON.stringify({ score: 70, strengths: ['ok'], improvements: ['more'], detailedAnalysis: 'a', overallAssessment: 'b' }) } };
  });
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); delete process.env.AI_PROVIDER; });

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
  const wrong = await answer({ questionId: 'c2', code: 'console.log(0)', executionResults: FAKE_CLAIM });
  assert.equal(wrong.status, 200);
  assert.equal(interview.responses[1].executionResults.success, false);
  assert.equal(interview.responses[1].executionResults.testsPassed, 0);
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
