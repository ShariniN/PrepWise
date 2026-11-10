// The seed bank proves itself: every JavaScript reference solution passes every one of its tests, run through the
// real grading code with the test-only vm checker standing in for the sandbox. The vm path lives under tests/ only.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { VmProvider } from './support/vmChecker.js';
import * as exec from '../services/execution/index.js';
import { gradeTests } from '../services/grading.js';
import { loadSeedFiles, upsertSeeds, toQuestionDoc } from '../services/seedQuestions.js';
import questionRepo from '../modules/practice/practice.repo.js';

const seeds = loadSeedFiles();
const coding = seeds.filter((s) => s.type === 'coding');
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

test('seed bank has the promised size and mix', () => {
  assert.ok(coding.length >= 60, `coding: ${coding.length}`);
  assert.ok(seeds.filter((s) => s.type === 'mcq').length >= 20);
  assert.ok(seeds.filter((s) => s.type === 'trace').length >= 10);
  assert.equal(new Set(seeds.map((s) => s.slug)).size, seeds.length, 'slugs must be unique');
});

test('every coding seed has starter code, two reference solutions and 3-8 mixed tests', () => {
  for (const q of coding) {
    assert.deepEqual(Object.keys(q.starterCode).sort(), ['java', 'javascript', 'python'], q.slug);
    assert.deepEqual(Object.keys(q.referenceSolutions).sort(), ['javascript', 'python'], q.slug);
    assert.ok(q.tests.length >= 3 && q.tests.length <= 8, q.slug);
    assert.ok(q.tests.some((t) => t.visible) && q.tests.some((t) => !t.visible), `${q.slug} needs visible and hidden tests`);
    assert.match(q.starterCode.java, /public class Main/, q.slug);
    assert.ok(q.statement.length > 80, q.slug);
  }
});

test('mcq and trace seeds have an answer key and an explanation', () => {
  for (const q of seeds.filter((s) => s.type === 'mcq')) {
    assert.ok(q.options.length >= 3 && q.correct.length >= 1 && q.correct.every((i) => i >= 0 && i < q.options.length), q.slug);
    assert.ok(q.explanation.length > 20, q.slug);
  }
  for (const q of seeds.filter((s) => s.type === 'trace')) {
    assert.ok(q.traceAnswer && q.explanation.length > 20, q.slug);
  }
});

test('every JavaScript reference solution passes all of its own tests (seed consistency)', async () => {
  exec.resetCache();
  exec.setProvider(new VmProvider());
  const bad = [];
  for (const q of coding) {
    const tests = q.tests.map((t, i) => ({ ...t, _id: String(i).padStart(24, '0') }));
    const g = await gradeTests({ language: 'javascript', source: q.referenceSolutions.javascript, tests, limits: { timeMs: q.timeLimitMs } });
    if (g.verdict !== 'accepted') bad.push(`${q.slug}: ${g.verdict} ${g.perTest.filter((t) => !t.passed).map((t) => t.stderr || t.verdict).join('|')}`);
  }
  assert.deepEqual(bad, []);
});

test('untouched starter code does not pass (the tests are not trivially satisfiable)', async () => {
  exec.resetCache();
  exec.setProvider(new VmProvider());
  for (const q of coding.slice(0, 20)) {
    const tests = q.tests.map((t, i) => ({ ...t, _id: String(i).padStart(24, '0') }));
    const g = await gradeTests({ language: 'javascript', source: q.starterCode.javascript, tests, limits: {} });
    assert.notEqual(g.verdict, 'accepted', q.slug);
  }
});

test('seeding is idempotent by slug and produces global, published, non-student-visible-secret documents', async () => {
  const w = makeWorld(); w.install();
  const db = installQuestionWorld(w);
  const first = await upsertSeeds(questionRepo, seeds);
  const count = db.questions.length;
  const second = await upsertSeeds(questionRepo, seeds);
  assert.equal(first.upserted, seeds.length);
  assert.equal(second.upserted, seeds.length);
  assert.equal(db.questions.length, count);
  assert.equal(db.questions.length, seeds.length);
  assert.ok(db.questions.every((q) => q.institutionId === null && q.status === 'published' && q.source === 'seed'));
  assert.equal(db.tests.length, coding.reduce((n, q) => n + q.tests.length, 0));
  const doc = toQuestionDoc(coding[0]);
  assert.equal(doc.referenceSolution.language, 'javascript');
  assert.equal(doc.altReferenceSolutions[0].language, 'python');
});
