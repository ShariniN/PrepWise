import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSkills, keywordMatch, parseScore, scoreResume } from '../services/cvScoring.js';

const JD = 'Software Engineering Intern. Required: Python, JavaScript, React, REST APIs, Git, SQL databases, data structures and algorithms.';
const CASHIER_CV = 'Jane Perera. Contact: jane@mail.com. Education: BSc in progress. Experience: cashier at a grocery store for two years. Hobbies: reading, cricket, travelling. Skills: communication, teamwork, Microsoft Word.';

test('skills are matched as whole terms, not substrings', () => {
  // "c" and "r" appear inside almost every word; "java" is inside "javascript"; "go" is an ordinary word.
  assert.deepEqual(findSkills('I love creative reading and I go to the store'), []);
  assert.ok(!findSkills('Built apps in JavaScript').includes('java'));
  assert.ok(findSkills('Built apps in JavaScript').includes('javascript'));
  assert.ok(findSkills('Wrote drivers in C and C++').includes('c++'));
  assert.ok(findSkills('APIs with Node.js and Express').includes('node.js'));
});

test('a CV with no technical skills gets no keyword credit', () => {
  const m = keywordMatch(CASHIER_CV, JD);
  assert.equal(m.matched.length, 0);
  assert.equal(m.score, 0);
  assert.ok(m.missing.includes('python'));
});

test('parseScore only accepts a clean number and never picks digits out of prose', () => {
  assert.equal(parseScore('0.42'), 0.42);
  assert.equal(parseScore(' 0.7 \n'), 0.7);
  assert.equal(parseScore('67'), 0.67); // a percentage is converted
  assert.equal(parseScore('1. Programming languages are strong'), null);
  assert.equal(parseScore('I would rate this candidate highly'), null);
  assert.equal(parseScore('1.7'), null);
});

test('when the AI fails, the result says so and does not invent a score', async () => {
  const r = await scoreResume({ resumeText: CASHIER_CV, jobDesc: JD, generate: async () => { throw new Error('404 model not found'); } });
  assert.equal(r.aiAvailable, false);
  assert.equal(r.aiScore, null);
  assert.match(r.aiError, /404/);
  assert.equal(r.matchPercentage, null, 'no blended percentage is shown without the AI');
  assert.equal(r.keywordScore, 0);
});

test('when the AI works, the blended score and its parts are all reported', async () => {
  const strongCv = 'Projects in Python and JavaScript with React, a REST API using Git and SQL; studied data structures and algorithms.';
  const r = await scoreResume({ resumeText: strongCv, jobDesc: JD, generate: async () => '0.30' });
  assert.equal(r.aiAvailable, true);
  assert.equal(r.aiScore, 0.3);
  assert.equal(r.keywordScore, 1);
  assert.equal(r.matchPercentage, Math.round((0.3 * 0.7 + 1 * 0.3) * 100));
  assert.ok(Array.isArray(r.matchedSkills) && r.matchedSkills.includes('python'));
});

test('the model that produced the score is reported', async () => {
  const r = await scoreResume({ resumeText: CASHIER_CV, jobDesc: JD, generate: async () => ({ text: '0.05', model: 'gemini-x' }) });
  assert.equal(r.model, 'gemini-x');
  assert.equal(r.aiScore, 0.05);
});

test('the AI prompt is not anchored with the keyword score', async () => {
  let prompt = '';
  await scoreResume({ resumeText: CASHIER_CV, jobDesc: JD, generate: async (p) => { prompt = p; return '0.1'; } });
  assert.doesNotMatch(prompt, /baseline/i);
  assert.match(prompt, /evidence/i, 'the prompt asks for evidence, so listed-but-unsupported skills score low');
});
