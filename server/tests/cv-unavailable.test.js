// CV analysis when parts of the AI fail: missing advice is flagged (QA-07), a failed technology extraction is
// flagged instead of looking like "no technologies" (QA-08). No real AI: the model call is injected.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractTechnologiesFromResume, buildJobResult } from '../controllers/cvAnalysiscontroller.js';

beforeEach(() => { for (const k of ['error', 'log', 'warn']) mock.method(console, k, () => {}); });
afterEach(() => mock.restoreAll());

const CV = 'Student CV. Projects with JavaScript, React and MongoDB. '.repeat(5);

test('technology extraction failure is flagged, not returned as an empty success', async () => {
  const r = await extractTechnologiesFromResume(CV, { generate: async () => { throw new Error('All AI models failed'); } });
  assert.deepEqual(r, { technologies: [], unavailable: true });
});

test('an unreadable model answer is also flagged as unavailable', async () => {
  const r = await extractTechnologiesFromResume(CV, { generate: async () => ({ text: 'sorry, no JSON today' }) });
  assert.deepEqual(r, { technologies: [], unavailable: true });
});

test('a real extraction returns the technologies and unavailable: false', async () => {
  const r = await extractTechnologiesFromResume(CV, {
    generate: async () => ({ text: '[{"name":"React","category":"Web Frameworks","confidenceLevel":6},{"name":"bad"}]' }),
  });
  assert.equal(r.unavailable, false);
  assert.deepEqual(r.technologies.map((t) => t.name), ['React']);
});

test('a genuinely empty list from the AI is not "unavailable"', async () => {
  const r = await extractTechnologiesFromResume(CV, { generate: async () => ({ text: '[]' }) });
  assert.deepEqual(r, { technologies: [], unavailable: false });
});

test('the per-job result keeps recommendationsUnavailable so the client can say advice is unavailable', () => {
  const r = buildJobResult({ matchPercentage: 70, recommendationsUnavailable: true, strengths: [], scoreBreakdown: { aiAvailable: true } }, '<p>JD</p>', []);
  assert.equal(r.recommendationsUnavailable, true);
  assert.equal(r.matchPercentage, 70);
  const ok = buildJobResult({ matchPercentage: 70, strengths: ['x'] }, '<p>JD</p>', []);
  assert.equal(ok.recommendationsUnavailable, false);
});
