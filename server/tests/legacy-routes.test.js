// Characterization tests for the student CV analysis, skills and interview routes: they pin the status and the
// full response body so the code behind them can be reorganised without changing what the client receives.
// Snapshots live in support/legacy-routes.snap.json; regenerate with UPDATE_SNAPSHOTS=1 only on purpose.
// No database and no real AI: models are stubbed and the AI provider is a stubbed axios call.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import axios from 'axios';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import CVAnalysis from '../models/CvAnalysis.js';
import SkillsAssessment from '../models/SkillsAssessment.js';
import InterviewModel from '../models/Interview.js';
import { usageRepo, resetAiCapCache } from '../services/aiUsage.js';
import app from '../app.js';

const SNAP_FILE = new URL('./support/legacy-routes.snap.json', import.meta.url);
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const snapshots = fs.existsSync(SNAP_FILE) ? JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8')) : {};
const seen = new Set();

// Ids and timestamps change on every run; everything else must match exactly.
const normalize = (value) => JSON.parse(JSON.stringify(value), (k, v) => {
  if (typeof v !== 'string') return v;
  if (/^[a-f\d]{24}$/i.test(v)) return '<id>';
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v)) return '<date>';
  return v;
});

const snap = (name, res) => {
  assert.ok(!seen.has(name), `duplicate snapshot name ${name}`);
  seen.add(name);
  const actual = normalize({ status: res.status, body: res.body });
  if (UPDATE) {
    snapshots[name] = actual;
    fs.writeFileSync(SNAP_FILE, `${JSON.stringify(Object.fromEntries(Object.entries(snapshots).sort()), null, 2)}\n`);
    return;
  }
  assert.ok(name in snapshots, `no snapshot for ${name}; run with UPDATE_SNAPSHOTS=1`);
  assert.deepEqual(actual, snapshots[name], name);
};

const same = (a, b) => String(a) === String(b);
const matches = (doc, q) => Object.entries(q).every(([k, v]) => same(doc[k], v));

// A mongoose-like query chain over an in-memory list.
const chain = (getDocs) => {
  const q = {
    sort: () => q, limit: () => q, skip: () => q, select: () => q, populate: () => q,
    lean: async () => getDocs().map((d) => d.toObject({ virtuals: false })),
    then: (ok, ko) => Promise.resolve(getDocs()).then(ok, ko),
  };
  return q;
};

let w, student, cvStore, skillStore, ivStore;
beforeEach(() => {
  resetAiCapCache();
  process.env.AI_PROVIDER = 'ollama';
  w = makeWorld(); w.install();
  student = w.addUser({ name: 'Stu', email: 's@a.edu', institutionId: IDS.instA });
  cvStore = []; skillStore = []; ivStore = [];

  mock.method(CVAnalysis, 'find', (q) => chain(() => cvStore.filter((d) => matches(d, q))));
  mock.method(CVAnalysis, 'findOne', async (q) => cvStore.find((d) => matches(d, q)) || null);
  mock.method(CVAnalysis, 'findOneAndDelete', async (q) => {
    const d = cvStore.find((x) => matches(x, q));
    cvStore = cvStore.filter((x) => x !== d);
    return d || null;
  });
  mock.method(CVAnalysis.prototype, 'save', async function save() { if (!cvStore.includes(this)) cvStore.push(this); return this; });

  mock.method(SkillsAssessment, 'find', (q) => chain(() => skillStore.filter((d) => matches(d, q))));
  mock.method(SkillsAssessment, 'findOne', async (q) => skillStore.find((d) => matches(d, q)) || null);
  mock.method(SkillsAssessment, 'create', async (data) => { const d = new SkillsAssessment(data); skillStore.push(d); return d; });
  mock.method(SkillsAssessment, 'findByIdAndUpdate', async (id, data) => {
    const d = skillStore.find((x) => same(x._id, id));
    d.set(data);
    return d;
  });
  mock.method(SkillsAssessment, 'findOneAndDelete', async (q) => {
    const d = skillStore.find((x) => matches(x, q));
    skillStore = skillStore.filter((x) => x !== d);
    return d || null;
  });

  mock.method(InterviewModel, 'findOne', async (q) => ivStore.find((d) => matches(d, q)) || null);
  mock.method(InterviewModel, 'find', (q) => chain(() => ivStore.filter((d) => matches(d, q))));
  mock.method(InterviewModel, 'countDocuments', async (q) => ivStore.filter((d) => matches(d, q)).length);
  mock.method(InterviewModel.prototype, 'save', async function save() { if (!ivStore.includes(this)) ivStore.push(this); return this; });

  mock.method(usageRepo, 'increment', async () => ({ calls: 1 }));
  mock.method(usageRepo, 'getCap', async () => 100);
  for (const k of ['error', 'log', 'warn']) mock.method(console, k, () => {});
});
afterEach(() => { mock.restoreAll(); delete process.env.AI_PROVIDER; });

const as = () => ({ Cookie: w.cookie(student) });
const get = (url) => request(app).get(url).set(as());
const post = (url, body) => request(app).post(url).set(as()).send(body);
const put = (url, body) => request(app).put(url).set(as()).send(body);
const del = (url) => request(app).delete(url).set(as());

// ---------------------------------------------------------------- CV analysis

const RESULT = {
  matchPercentage: 72, isNonTechRole: false, strengths: ['Node.js'], contentWeaknesses: ['tests'], structureWeaknesses: [],
  contentRecommendations: ['add tests'], structureRecommendations: ['links'], scoreBreakdown: { aiScore: 70, keywordScore: 76 },
  message: null, hasError: false, timestamp: '2026-01-01T00:00:00.000Z',
};
const NON_TECH = { matchPercentage: 0, isNonTechRole: true, message: 'not a CS role' };

test('POST /api/analyze/save creates, updates, toggles and validates', async () => {
  snap('cv save missing fields', await post('/api/analyze/save', { jobDescriptions: ['jd'] }));
  snap('cv toggle unknown hash', await post('/api/analyze/save', { resumeHash: 'nope' }));
  const body = { resumeText: 'CV text', resumeHash: 'h1', jobDescriptions: ['JD one', 'JD two'], results: [RESULT, NON_TECH], extractedTechnologies: [{ name: 'Node.js' }] };
  snap('cv save new', await post('/api/analyze/save', body));
  assert.equal(cvStore.length, 1);
  snap('cv save update', await post('/api/analyze/save', { ...body, shouldSave: false, results: [RESULT] }));
  assert.equal(cvStore.length, 1, 'same hash updates the existing analysis');
  snap('cv toggle existing', await post('/api/analyze/save', { resumeHash: 'h1', shouldSave: true }));
  snap('cv save without hash', await post('/api/analyze/save', { resumeText: 'Other CV', jobDescriptions: ['JD'], results: [RESULT] }));
  assert.equal(cvStore.length, 2);
});

test('GET saved analyses: both URLs give the same list', async () => {
  snap('cv saved empty', await get('/api/analyze/saved'));
  cvStore.push(new CVAnalysis({ userId: student._id, institutionId: IDS.instA, resumeHash: 'h', jobDescriptions: ['JD'], results: [RESULT, NON_TECH, { ...RESULT, matchPercentage: 40 }], isSaved: true }));
  cvStore.push(new CVAnalysis({ userId: newId(), resumeHash: 'h', jobDescriptions: ['JD'], results: [RESULT], isSaved: true }));
  const a = await get('/api/analyze/saved');
  snap('cv saved list', a);
  const b = await get('/api/user/saved-analyses');
  assert.deepEqual(normalize(b.body), normalize(a.body));
  assert.equal(a.body.count, 1, 'only the caller\'s analyses');
});

test('DELETE an analysis: bad id, not found, own analysis (both URLs)', async () => {
  snap('cv delete bad id', await del('/api/analyze/delete/xyz'));
  snap('cv delete not found', await del(`/api/analyze/delete/${newId()}`));
  const mine = () => {
    const d = new CVAnalysis({ userId: student._id, resumeHash: 'h', resumeText: 'cv', jobDescriptions: ['JD'], results: [RESULT], isSaved: true });
    cvStore.push(d);
    return d;
  };
  snap('cv delete ok', await del(`/api/analyze/delete/${mine()._id}`));
  snap('cv delete ok via user', await del(`/api/user/analysis/${mine()._id}`));
  assert.equal(cvStore.length, 0);
});

test('POST /api/analyze/analyze-resume input validation', async () => {
  snap('analyze bad json', await post('/api/analyze/analyze-resume', { jobDescriptions: '{nope' }));
  snap('analyze no jds', await post('/api/analyze/analyze-resume', { jobDescriptions: '[]' }));
  snap('analyze no file', await post('/api/analyze/analyze-resume', { jobDescriptions: '["JD"]' }));
  snap('analyze no profile cv', await post('/api/analyze/analyze-resume', { jobDescriptions: '["JD"]', useProfileCV: 'true' }));
});

// ---------------------------------------------------------------- skills self-assessment

const TECHS = [
  { name: ' Node.js ', category: 'Web', confidenceLevel: 8 },
  { name: 'Python', proficiencyLevel: 5.55, yearsOfExperience: 2, isCore: true },
  { name: 'Git', confidenceLevel: 6 },
];

test('POST /api/swot/save-ratings validates, creates, updates and reports DB failures', async () => {
  snap('skills no hash', await post('/api/swot/save-ratings', { technologies: TECHS }));
  snap('skills no techs', await post('/api/swot/save-ratings', { resumeHash: 'h', technologies: [] }));
  snap('skills bad techs', await post('/api/swot/save-ratings', { resumeHash: 'h', technologies: [{ confidenceLevel: 3 }, { name: 'X' }, { name: 'Y', confidenceLevel: 11 }] }));
  snap('skills create', await post('/api/swot/save-ratings', { resumeHash: 'h', technologies: TECHS }));
  assert.equal(skillStore.length, 1);
  snap('skills update', await post('/api/swot/save-ratings', { resumeHash: 'h', technologies: TECHS.slice(0, 1), shouldSave: false, summary: { extra: 1 } }));
  assert.equal(skillStore.length, 1);
  mock.method(SkillsAssessment, 'create', async () => { throw new Error('db down'); });
  const res = await post('/api/swot/save-ratings', { resumeHash: 'other', technologies: TECHS });
  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, 'Failed to save technology ratings');
});

test('GET /api/user/skills-assessments lists the caller\'s assessments', async () => {
  snap('skills list empty', await get('/api/user/skills-assessments'));
  skillStore.push(new SkillsAssessment({
    userId: student._id, resumeHash: 'h', assessmentType: 'Technical Skills', isSaved: true, overallScore: 64,
    skills: [{ name: 'Node.js', category: 'Web', proficiencyLevel: 8 }, { name: 'Git', proficiencyLevel: 4 }, { name: 'SQL', category: 'DB', proficiencyLevel: 7 }],
  }));
  skillStore.push(new SkillsAssessment({ userId: newId(), resumeHash: 'h', skills: [{ name: 'X', proficiencyLevel: 2 }] }));
  snap('skills list', await get('/api/user/skills-assessments'));
});

test('DELETE /api/user/assessment/:id', async () => {
  snap('skills delete bad id', await del('/api/user/assessment/xyz'));
  snap('skills delete not found', await del(`/api/user/assessment/${newId()}`));
  const d = new SkillsAssessment({ userId: student._id, resumeHash: 'h', isSaved: true, skills: [{ name: 'X', proficiencyLevel: 2 }] });
  skillStore.push(d);
  snap('skills delete ok', await del(`/api/user/assessment/${d._id}`));
});

// ---------------------------------------------------------------- interviews

const AI_QUESTIONS = [
  { questionId: 'q1', type: 'behavioural', question: 'Tell me about\nyour Node.js project', category: 'projects', difficulty: 'easy' },
  { type: 'code', question: 'Write a function that sums an array of numbers', followUpQuestions: ['why?'] },
  { questionId: 'q3', type: 'coding', question: 'Reverse a string', language: 'python', cvReference: 'Python course' },
  { questionId: 'q4', type: 'system-design', question: 'Design a URL shortener', jdAlignment: 'backend' },
];
const aiReturns = (payload) => mock.method(axios, 'post', async () => ({ data: { response: typeof payload === 'string' ? payload : JSON.stringify(payload) } }));

test('POST /api/interviews/create: validation, AI questions and the fallback set', async () => {
  snap('iv create missing', await post('/api/interviews/create', { jobDescription: 'JD' }));
  aiReturns(AI_QUESTIONS);
  snap('iv create ai', await post('/api/interviews/create', { jobDescription: ' Backend intern, Java and Spring ', resumeText: ' CV with Java, Spring and Maven ' }));
  aiReturns('no json here');
  snap('iv create fallback', await post('/api/interviews/create', { jobDescription: 'Frontend intern', resumeText: 'CV with React' }));
  assert.equal(ivStore.length, 2);
});

test('POST /api/interviews/create-with-profile-cv', async () => {
  snap('iv profile missing jd', await post('/api/interviews/create-with-profile-cv', {}));
  snap('iv profile no cv', await post('/api/interviews/create-with-profile-cv', { jobDescription: 'JD' }));
  student.currentCV = { text: 'Profile CV: C++ and Qt developer', fileName: 'cv.pdf' };
  student.getCVText = function getCVText() { return this.currentCV.text; };
  Object.defineProperty(student, 'hasCV', { get() { return !!this.currentCV?.text; }, configurable: true });
  aiReturns(AI_QUESTIONS.slice(0, 2));
  snap('iv profile ok', await post('/api/interviews/create-with-profile-cv', { jobDescription: ' Systems intern ' }));
  assert.equal(ivStore[0].resumeText, 'Profile CV: C++ and Qt developer');
});

const makeInterview = (fields = {}) => {
  const iv = new InterviewModel({
    userId: student._id, institutionId: IDS.instA, jobDescription: 'JD', resumeText: 'CV', status: 'created',
    questions: [
      { questionId: 'b1', type: 'behavioral', question: 'Q1', category: 'c', difficulty: 'easy' },
      { questionId: 'c1', type: 'coding', question: 'Q2', category: 'c', difficulty: 'easy', language: 'javascript', tests: [{ input: '1', expectedOutput: '2' }] },
    ],
    totalQuestions: 2, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...fields,
  });
  ivStore.push(iv);
  return iv;
};

test('interview start, next question, details and history', async () => {
  snap('iv start not found', await put(`/api/interviews/${newId()}/start`));
  const iv = makeInterview();
  snap('iv next first', await get(`/api/interviews/${iv._id}/next-question`));
  snap('iv start ok', await put(`/api/interviews/${iv._id}/start`));
  snap('iv start again', await put(`/api/interviews/${iv._id}/start`));
  snap('iv get', await get(`/api/interviews/${iv._id}`));
  snap('iv get not found', await get(`/api/interviews/${newId()}`));
  snap('iv history', await get('/api/interviews/history'));
});

test('submit-answer: skipped answer, unknown question, empty answer and completion of a skipped interview', async () => {
  const iv = makeInterview({ status: 'created' });
  snap('iv submit unknown question', await post(`/api/interviews/${iv._id}/submit-answer`, { questionId: 'zz' }));
  snap('iv submit empty answer', await post(`/api/interviews/${iv._id}/submit-answer`, { questionId: 'b1', responseText: '  ' }));
  snap('iv submit skipped', await post(`/api/interviews/${iv._id}/submit-answer`, { questionId: 'b1', skipped: true, responseTime: '12' }));
  assert.equal(iv.status, 'in_progress');
  snap('iv next after skip', await get(`/api/interviews/${iv._id}/next-question`));
  await post(`/api/interviews/${iv._id}/submit-answer`, { questionId: 'c1', skipped: true });
  snap('iv next done', await get(`/api/interviews/${iv._id}/next-question`));
  const done = await put(`/api/interviews/${iv._id}/complete`);
  done.body.results.duration = '<duration>';
  done.body.results.feedback.duration = '<duration>';
  snap('iv complete all skipped', done);
  snap('iv feedback all skipped', await get(`/api/interviews/${iv._id}/feedback`));
});

test('submit-answer: an answered behavioural question with AI feedback, then with the AI unusable', async () => {
  const iv = makeInterview({ status: 'in_progress' });
  aiReturns({ score: 77, responseType: 'x', strengths: ['a', 'b', 'c', 'd', 'e'], improvements: ['i'], detailedAnalysis: 'd', overallAssessment: 'o', questionRelevance: 8, correctness: 7, communicationClarity: 6, technicalAccuracy: 0 });
  snap('iv submit ai', await post(`/api/interviews/${iv._id}/submit-answer`, {
    questionId: 'b1', responseText: 'I built a project with a team', answerMode: 'audio', responseTime: 40,
    deliveryMetrics: { cameraUsed: true, faceVisiblePct: 120, eyeContactPct: 55.55, lookAwayCount: 3.4, headMovement: 'low', wordsPerMinute: 130.6, fillerWordCount: 2, durationSec: 40, extra: 'x' },
  }));
  aiReturns('nothing useful');
  snap('iv submit fallback', await post(`/api/interviews/${iv._id}/submit-answer`, { questionId: 'b1', responseText: 'Short answer about a project where I learned and completed it during work', responseTime: 20 }));
});

test('every snapshot in the file is still used', () => {
  if (UPDATE) return;
  assert.deepEqual(Object.keys(snapshots).filter((k) => !seen.has(k)), []);
});
