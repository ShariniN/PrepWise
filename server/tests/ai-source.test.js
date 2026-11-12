// The AI choke point: per-university cap reaches aiService through the request context,
// and interview feedback is labelled with where it came from. The model call itself is stubbed.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiClient } from '../services/aiService.js';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import InterviewModel from '../models/Interview.js';
import { usageRepo, resetAiCapCache } from '../services/aiUsage.js';
import { installAnswerClaims } from './support/interviewClaims.js';
import app from '../app.js';

let w, student, interview, increments;
beforeEach(() => {
  resetAiCapCache();
  w = makeWorld();
  w.install();
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  interview = {
    _id: 'i1', userId: student._id, status: 'created', currentQuestionIndex: 0, responses: [],
    questions: [{ questionId: 'q1', question: 'Tell me about yourself', type: 'behavioral' }],
    async save() { return this; },
  };
  mock.method(InterviewModel, 'findOne', async () => interview);
  installAnswerClaims((id) => (String(id) === String(interview._id) ? interview : null));
  increments = [];
  mock.method(usageRepo, 'increment', async (id) => { increments.push(id); return { calls: increments.length }; });
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => mock.restoreAll());

const answer = () => request(app).post('/api/interviews/i1/submit-answer').set('Cookie', w.cookie(student))
  .send({ questionId: 'q1', responseText: 'I am a graduate who enjoys building things and working in teams.', answerMode: 'text', responseTime: 30 });

test('AI-produced feedback is labelled source "ai" and the call is metered against the student\'s university', async () => {
  mock.method(usageRepo, 'getCap', async () => 100);
  const ai = mock.method(aiClient, 'generate', async () => JSON.stringify({ score: 80, strengths: ['clear'], improvements: ['more detail'], detailedAnalysis: 'ok', overallAssessment: 'good' }));
  const res = await answer();
  assert.equal(ai.mock.callCount(), 1, 'the answer went to the AI client');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.feedback.source, 'ai');
  assert.equal(res.body.feedback.score, 80);
  assert.deepEqual(increments, [IDS.instA]);
});

test('when the university cap is exhausted the model is not called and feedback is labelled "fallback"', async () => {
  mock.method(usageRepo, 'getCap', async () => 0);
  const post = mock.method(aiClient, 'generate', async () => { throw new Error('model must not be called'); });
  const res = await answer();
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.feedback.source, 'fallback');
  assert.equal(post.mock.callCount(), 0);
});
