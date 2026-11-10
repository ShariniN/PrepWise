// Delivery coaching metrics on mock interview answers: validated strictly, stored on the response,
// returned to the student, and never used for the AI score. No real AI, no real database.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import InterviewModel from '../models/Interview.js';
import { usageRepo, resetAiCapCache } from '../services/aiUsage.js';
import { sanitizeDeliveryMetrics, summarizeDelivery } from '../modules/interviews/interviews.controller.js';
import app from '../app.js';

const KEYS = ['cameraUsed', 'faceVisiblePct', 'eyeContactPct', 'lookAwayCount', 'headMovement', 'wordsPerMinute', 'fillerWordCount', 'durationSec'];
const GOOD = { cameraUsed: true, faceVisiblePct: 92, eyeContactPct: 71.25, lookAwayCount: 2, headMovement: 'medium', wordsPerMinute: 138, fillerWordCount: 4, durationSec: 41.5 };
const ALL_NULL = { cameraUsed: false, faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null, wordsPerMinute: null, fillerWordCount: null, durationSec: null };

let w, student, interview, aiPrompts;
beforeEach(() => {
  resetAiCapCache();
  process.env.AI_PROVIDER = 'huggingface'; process.env.HF_API_TOKEN = 'test-token';
  w = makeWorld(); w.install();
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  interview = {
    _id: 'i1', userId: student._id, status: 'in_progress', currentQuestionIndex: 0, responses: [], totalDuration: 300,
    questions: [
      { questionId: 'b1', question: 'Tell me about a project you are proud of', type: 'behavioral' },
      { questionId: 'b2', question: 'Describe a conflict in a team', type: 'behavioral' },
      { questionId: 'b3', question: 'Why this role?', type: 'behavioral' },
    ],
    async save() { return this; },
  };
  mock.method(InterviewModel, 'findOne', async () => interview);
  mock.method(usageRepo, 'increment', async () => ({ calls: 1 }));
  mock.method(usageRepo, 'getCap', async () => 100);
  aiPrompts = [];
  mock.method(axios, 'post', async (url, body) => {
    aiPrompts.push(JSON.stringify(body));
    return { data: { generated_text: JSON.stringify({ score: 70, strengths: ['ok'], improvements: ['more'], detailedAnalysis: 'a', overallAssessment: 'b' }) } };
  });
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
  mock.method(console, 'warn', () => {});
});
afterEach(() => { mock.restoreAll(); delete process.env.AI_PROVIDER; delete process.env.HF_API_TOKEN; });

const answer = (body) => request(app).post('/api/interviews/i1/submit-answer').set('Cookie', w.cookie(student))
  .send({ questionId: 'b1', responseText: 'I built a timetable app for my university society with React and Node.', answerMode: 'audio', responseTime: 40, ...body });

test('valid delivery metrics are stored on the response and echoed back', async () => {
  const res = await answer({ deliveryMetrics: GOOD });
  assert.equal(res.status, 200, res.text);
  const saved = interview.responses[0].deliveryMetrics;
  assert.deepEqual(Object.keys(saved), KEYS);
  assert.deepEqual(saved, { ...GOOD, eyeContactPct: 71.3 });
  assert.deepEqual(res.body.deliveryMetrics, saved);
});

test('delivery metrics never reach the AI and never change the score', async () => {
  const withMetrics = await answer({ deliveryMetrics: { ...GOOD, eyeContactPct: 3, lookAwayCount: 40, fillerWordCount: 99 } });
  const without = await answer({ questionId: 'b2' });
  assert.equal(withMetrics.status, 200, withMetrics.text);
  assert.equal(withMetrics.body.feedback.score, without.body.feedback.score);
  assert.equal(interview.responses[0].feedback.score, interview.responses[1].feedback.score);
  const prompts = aiPrompts.join('\n');
  for (const word of ['deliveryMetrics', 'eyeContact', 'lookAway', 'fillerWord', 'wordsPerMinute', 'headMovement', 'faceVisible']) {
    assert.ok(!prompts.includes(word), `AI prompt mentions ${word}`);
  }
});

test('invalid fields become null, numbers are clamped, unknown keys are dropped, nothing is rejected', async () => {
  const res = await answer({
    deliveryMetrics: {
      cameraUsed: true, faceVisiblePct: 140, eyeContactPct: '80', lookAwayCount: 2.6, headMovement: 'extreme',
      wordsPerMinute: -20, fillerWordCount: Infinity, durationSec: 99999,
      videoFrame: 'data:image/png;base64,AAAA', integrityFlag: true,
    },
  });
  assert.equal(res.status, 200, res.text);
  const saved = interview.responses[0].deliveryMetrics;
  assert.deepEqual(Object.keys(saved), KEYS);
  assert.deepEqual(saved, {
    cameraUsed: true, faceVisiblePct: 100, eyeContactPct: null, lookAwayCount: 3, headMovement: null,
    wordsPerMinute: 0, fillerWordCount: null, durationSec: 7200,
  });
  assert.ok(!JSON.stringify(interview.responses[0]).includes('base64'));
});

// The AI service allows 10 calls a minute per process, so loops over many values use the sanitiser
// directly and only one value of each kind goes through HTTP.
const CAMERA_OFF = { cameraUsed: false, faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null, wordsPerMinute: 138, fillerWordCount: 4, durationSec: 41.5 };

test('camera fields are null unless cameraUsed is exactly true', async () => {
  const res = await answer({ deliveryMetrics: { ...GOOD, cameraUsed: 'true' } });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(interview.responses[0].deliveryMetrics, CAMERA_OFF);
  for (const cameraUsed of [false, 1, undefined, null]) {
    assert.deepEqual(sanitizeDeliveryMetrics({ ...GOOD, cameraUsed }), CAMERA_OFF);
  }
});

test('old clients without deliveryMetrics, or junk values, still submit fine and store null', async () => {
  for (const body of [{}, { deliveryMetrics: 'abc' }]) {
    interview.responses = [];
    const res = await answer(body);
    assert.equal(res.status, 200, res.text);
    assert.equal(interview.responses[0].deliveryMetrics, null);
    assert.equal(res.body.deliveryMetrics, null);
  }
  for (const junk of [undefined, null, 'abc', 42, [1, 2], true]) assert.equal(sanitizeDeliveryMetrics(junk), null);
});

test('skipped questions store no delivery metrics', async () => {
  const res = await answer({ skipped: true, deliveryMetrics: GOOD });
  assert.equal(res.status, 200, res.text);
  assert.equal(interview.responses[0].deliveryMetrics, undefined);
});

test('the feedback report returns per-answer metrics and a delivery summary to the student', async () => {
  await answer({ questionId: 'b1', deliveryMetrics: GOOD });
  await answer({ questionId: 'b2', deliveryMetrics: { ...GOOD, eyeContactPct: 51, lookAwayCount: 1, headMovement: 'low', wordsPerMinute: 162, fillerWordCount: 0 } });
  // a typed answer from earlier in the interview (stored as the server would store it)
  interview.responses.push({ questionId: 'b3', question: 'Why this role?', questionType: 'behavioral', skipped: false, feedback: { score: 60 }, deliveryMetrics: sanitizeDeliveryMetrics(ALL_NULL) });
  const res = await request(app).get('/api/interviews/i1/feedback').set('Cookie', w.cookie(student));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body.feedback.responses[0].deliveryMetrics, { ...GOOD, eyeContactPct: 71.3 });
  assert.deepEqual(res.body.feedback.deliverySummary, {
    answersMeasured: 3, answersWithCamera: 2, answersWithSpeech: 2,
    faceVisiblePct: 92, eyeContactPct: 61, lookAwayCount: 3, headMovement: 'low',
    wordsPerMinute: 150, fillerWordCount: 4,
  });
});

test('sanitizeDeliveryMetrics unit cases', () => {
  assert.equal(sanitizeDeliveryMetrics(undefined), null);
  assert.deepEqual(sanitizeDeliveryMetrics({}), ALL_NULL);
  assert.deepEqual(sanitizeDeliveryMetrics({ cameraUsed: true, faceVisiblePct: NaN, eyeContactPct: -5, lookAwayCount: -1, headMovement: 'LOW' }), {
    ...ALL_NULL, cameraUsed: true, faceVisiblePct: null, eyeContactPct: 0, lookAwayCount: 0, headMovement: null,
  });
  assert.equal(sanitizeDeliveryMetrics({ wordsPerMinute: 139.6 }).wordsPerMinute, 140);
  assert.equal(sanitizeDeliveryMetrics({ fillerWordCount: true }).fillerWordCount, null);
});

test('summarizeDelivery with nothing measured', () => {
  assert.deepEqual(summarizeDelivery([{ skipped: true }, { deliveryMetrics: null }]), {
    answersMeasured: 0, answersWithCamera: 0, answersWithSpeech: 0, faceVisiblePct: null, eyeContactPct: null,
    lookAwayCount: null, headMovement: null, wordsPerMinute: null, fillerWordCount: null,
  });
});

test('schema accepts all-null and full delivery metrics, and older responses without them', () => {
  const base = { userId: '64b000000000000000000001', jobDescription: 'jd', resumeText: 'cv' };
  const resp = (extra) => ({ questionId: 'q', question: 'Q?', questionType: 'behavioral', ...extra });
  const doc = new InterviewModel({ ...base, responses: [resp({ deliveryMetrics: ALL_NULL }), resp({ deliveryMetrics: GOOD }), resp({})] });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.responses[0].deliveryMetrics.headMovement, null);
  assert.equal(doc.responses[1].deliveryMetrics.eyeContactPct, 71.25);
  assert.equal(doc.responses[2].deliveryMetrics, null);
  const bad = new InterviewModel({ ...base, responses: [resp({ deliveryMetrics: { ...GOOD, headMovement: 'wild' } })] });
  assert.ok(bad.validateSync());
});
