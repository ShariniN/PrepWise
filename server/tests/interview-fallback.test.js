// When the AI is unavailable: fallback-scored answers are not presented or counted as AI scores (QA-04),
// and interviews built from the generic fallback question pool say so (QA-05). No real AI, no database.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { aiClient } from '../services/aiService.js';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import InterviewModel from '../models/Interview.js';
import { usageRepo, resetAiCapCache } from '../services/aiUsage.js';
import { calculateFinalResults, fallbackSlot } from '../modules/interviews/interviews.questions.js';
import { interviewAi } from '../modules/interviews/interviews.controller.js';
import app from '../app.js';

const ans = (questionType, score, source = 'ai', extra = {}) => ({
  questionId: `${questionType}-${score}-${source}`, questionType, skipped: false, responseTime: 30,
  feedback: { score, source, communicationClarity: 6, technicalAccuracy: 6 }, ...extra,
});

test('calculateFinalResults leaves fallback-scored answers out of every score and counts them', () => {
  const r = calculateFinalResults([ans('behavioral', 80), ans('technical', 60), ans('technical', 35, 'fallback'), { questionId: 's', skipped: true }], 300);
  assert.equal(r.score, 70);
  assert.equal(r.categoryPercentages.technical, 60);
  assert.equal(r.excludedFallbackAnswers, 1);
  assert.equal(r.scoredAnswers, 2);
  assert.equal(r.scoreIsPartial, true);
  assert.equal(r.breakdown.answeredQuestions, 3, 'the fallback answer still counts as answered');
});

test('calculateFinalResults gives no score when every answer was scored by the fallback', () => {
  const r = calculateFinalResults([ans('behavioral', 35, 'fallback'), ans('coding', 40, 'fallback')], 300);
  assert.equal(r.score, null);
  assert.equal(r.excludedFallbackAnswers, 2);
  assert.equal(r.scoredAnswers, 0);
  assert.equal(r.scoreIsPartial, false);
});

test('calculateFinalResults without fallback answers is unchanged and not partial', () => {
  const r = calculateFinalResults([ans('behavioral', 80), ans('coding', 60)], 300);
  assert.equal(r.score, 70);
  assert.equal(r.excludedFallbackAnswers, 0);
  assert.equal(r.scoreIsPartial, false);
});

// ---------------------------------------------------------------- endpoints
let w, student, interview, aiCalls, aiDown, saved;
beforeEach(() => {
  resetAiCapCache();
  w = makeWorld(); w.install();
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  interview = {
    _id: 'i1', userId: student._id, status: 'in_progress', currentQuestionIndex: 2, totalDuration: 300, startedAt: new Date(Date.now() - 60000),
    questions: [{ questionId: 'b1', question: 'Q1', type: 'behavioral' }, { questionId: 'b2', question: 'Q2', type: 'technical' }],
    responses: [],
    async save() { return this; },
  };
  mock.method(InterviewModel, 'findOne', async () => interview);
  saved = [];
  mock.method(InterviewModel.prototype, 'save', async function save() { saved.push(this); return this; });
  mock.method(usageRepo, 'increment', async () => ({ calls: 1 }));
  mock.method(usageRepo, 'getCap', async () => 100);
  aiCalls = 0; aiDown = false;
  mock.method(aiClient, 'generate', async () => {
    aiCalls += 1;
    // "Down" = the model answers with something unusable.
    if (aiDown) return 'Sorry, I cannot help with that right now.';
    return JSON.stringify({ overallScore: 90, readinessLevel: 'Ready', keyStrengths: ['x'], majorImprovements: [], recommendations: ['r'], generalFeedback: 'g' });
  });
  for (const k of ['error', 'log', 'warn']) mock.method(console, k, () => {});
});
afterEach(() => mock.restoreAll());

const as = () => ({ Cookie: w.cookie(student) });

test('completing an interview whose answers were all fallback-scored makes no AI call and reports no score', async () => {
  interview.responses = [ans('behavioral', 35, 'fallback'), ans('technical', 40, 'fallback')];
  const res = await request(app).put('/api/interviews/i1/complete').set(as());
  assert.equal(res.status, 200, res.text);
  assert.equal(aiCalls, 0, 'no overall AI feedback for answers the AI never saw');
  assert.equal(res.body.results.score, null);
  assert.equal(res.body.results.excludedFallbackAnswers, 2);
  assert.equal(interview.overallFeedback.score, null);
});

test('completing a mixed interview scores only the AI-scored answers', async () => {
  interview.responses = [ans('behavioral', 80), ans('technical', 35, 'fallback')];
  const res = await request(app).put('/api/interviews/i1/complete').set(as());
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.results.score, 80);
  assert.equal(res.body.results.excludedFallbackAnswers, 1);
  assert.equal(res.body.results.scoreIsPartial, true);
  assert.equal(aiCalls, 1, 'the overall feedback went to the AI client');
  const fb = await request(app).get('/api/interviews/i1/feedback').set(as());
  assert.equal(fb.body.feedback.score, 80);
  assert.equal(fb.body.feedback.excludedFallbackAnswers, 1);
});

// Creation uses the CV on file and the target role; the question pool is one AI call (stubbed through interviewAi).
const ROLE_ID = 'cccccccccccccccccccccccc';
const readyStudent = () => {
  w.institutions[IDS.instA].targetRoles = [{ _id: ROLE_ID, title: 'Backend developer intern', description: 'Builds APIs', skills: ['Node.js', 'MongoDB'] }];
  student.targetRoleId = ROLE_ID;
  student.currentCV = { text: 'Student CV with Node.js, Express, MongoDB projects and tests.', fileName: 'cv.pdf' };
};

test('interview creation reports when the generic fallback questions were used', async () => {
  readyStudent();
  mock.method(interviewAi, 'generate', async () => ({ text: 'Sorry, I cannot help with that right now.' }));
  const res = await request(app).post('/api/interviews/create').set(as()).send({ readiness: 'some_practice', jobDescription: 'Junior backend developer, Node.js and MongoDB' });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.usedFallbackQuestions, true);
  assert.equal(res.body.interview.usedFallbackQuestions, true);
  assert.equal(saved[0].usedFallbackQuestions, true, 'stored on the interview, so a reload still knows');
  assert.deepEqual(res.body.interview.questions[0].question, fallbackSlot(0).medium.question);
});

test('interview creation with AI questions says usedFallbackQuestions: false', async () => {
  readyStudent();
  const slot = (n) => Object.fromEntries(['easy', 'medium', 'hard'].map((l) => [l, { question: `Tell me about your Node.js project (slot ${n}, ${l})`, category: 'x' }]));
  mock.method(interviewAi, 'generate', async () => ({ text: JSON.stringify({ slots: { 0: slot(0), 1: slot(1), 3: slot(3), 4: slot(4) } }) }));
  const res = await request(app).post('/api/interviews/create').set(as()).send({ readiness: 'ready' });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.usedFallbackQuestions, false);
  assert.equal(res.body.interview.questions[0].question, 'Tell me about your Node.js project (slot 0, hard)');
});
