import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import './helpers.js';
import User from '../models/User.js';
import Interview from '../models/Interview.js';
import CVAnalysis from '../models/CvAnalysis.js';
import Institution from '../models/Institution.js';
import { DEFAULT_TARGET_ROLES } from '../config/defaultTargetRoles.js';
import { findTargetRole, roleAsJobDescription } from '../services/targetRoles.js';
import { DEMOS, LECTURER_GROUPS } from '../scripts/seed-demo.js';

const oid = () => new mongoose.Types.ObjectId();

test('user status accepts unverified', () => {
  const u = new User({ name: 'A', email: 'a@x.test', institutionId: oid(), status: 'unverified' });
  assert.equal(u.validateSync(), undefined);
  assert.equal(u.targetRoleId, null);
  assert.deepEqual([...u.assignedGroups], []);
  assert.equal(u.emailVerifyTokenHash, '');
  assert.equal(u.emailVerifyExpiresAt, null);
});

test('interview pool is not selected by default', () => {
  assert.equal(Interview.schema.path('pool').options.select, false);
  const doc = new Interview({ userId: oid(), jobDescription: 'j', resumeText: 'r', pool: { easy: [1] } });
  assert.equal('pool' in doc.toJSON(), false, 'pool is stripped from JSON even when selected');
});

test('interview adaptive fields', () => {
  const doc = new Interview({
    userId: oid(), jobDescription: 'j', resumeText: 'r', startLevel: 'easy', levelReached: null, readiness: 'ready',
    questions: [{ questionId: 'q', type: 'technical', question: 'q', category: 'c', difficulty: 'easy', slot: 4, level: 'hard' }],
  });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.targetRoleId, null);
  doc.questions[0].slot = 5;
  assert.ok(doc.validateSync().errors['questions.0.slot']);
});

test('cv result kind defaults to job_description', () => {
  const doc = new CVAnalysis({ userId: oid(), resumeHash: 'h', jobDescriptions: ['x'], results: [{ matchPercentage: 50 }] });
  assert.equal(doc.results[0].kind, 'job_description');
  assert.equal(doc.targetRoleId, null);
  const noJd = new CVAnalysis({ userId: oid(), resumeHash: 'h', results: [{ matchPercentage: 50, kind: 'target_role' }] });
  assert.equal(noJd.validateSync(), undefined);
});

test('institution defaults and target role validation', () => {
  const i = new Institution({ name: 'N', slug: 'n' });
  assert.equal(i.selfSignup, false);
  assert.equal(i.targetRoles.length, 0);
  i.targetRoles.push({ title: '' });
  assert.ok(i.validateSync());
});

test('default target roles match the spec', () => {
  assert.deepEqual(DEFAULT_TARGET_ROLES.map((r) => r.title), [
    'Software engineer intern', 'Frontend developer intern', 'Data analyst intern', 'QA engineer intern', 'Business analyst intern',
  ]);
  for (const r of DEFAULT_TARGET_ROLES) {
    assert.ok(r.skills.length >= 6 && r.skills.length <= 10, r.title);
    const sentences = r.description.split(/(?<=\.)\s+/).length;
    assert.ok(sentences >= 2 && sentences <= 4, r.title);
  }
  assert.equal(new Institution({ name: 'N', slug: 'n', targetRoles: DEFAULT_TARGET_ROLES }).validateSync(), undefined);
});

test('roleAsJobDescription formats title, description and skills', () => {
  const role = { title: 'QA intern', description: 'Tests things.', skills: ['Jest', 'SQL'] };
  assert.equal(roleAsJobDescription(role), 'QA intern\n\nTests things.\n\nKey skills: Jest, SQL');
});

test('findTargetRole returns null for a deleted id', () => {
  const inst = new Institution({ name: 'N', slug: 'n', targetRoles: [{ title: 'A' }] });
  const id = inst.targetRoles[0]._id;
  assert.equal(findTargetRole(inst, String(id)).title, 'A');
  assert.equal(findTargetRole(inst, oid()), null);
  assert.equal(findTargetRole(inst, null), null);
  assert.equal(findTargetRole(null, id), null);
});

test('demo seed: demo-a allows self-signup and lecturers have groups', () => {
  assert.equal(DEMOS.find((d) => d.slug === 'demo-a').selfSignup, true);
  assert.equal(DEMOS.find((d) => d.slug === 'demo-b').selfSignup, undefined);
  assert.deepEqual(LECTURER_GROUPS, { 'Leo Lecturer': ['Group 1'], 'Lena Lecturer': ['Group 2'] });
});

test('models/User.js does not import from modules/', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../models/User.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from\s+['"][^'"]*modules\//);
  const groups = readFileSync(new URL('../services/groups.js', import.meta.url), 'utf8');
  assert.doesNotMatch(groups, /from\s+['"]/);
});

test('services/groups cleanGroup: valid, over-long and empty', async () => {
  const { cleanGroup, InvalidGroupError, MAX_GROUP_CHARS } = await import('../services/groups.js');
  assert.equal(cleanGroup('  CS   2026 '), 'CS 2026');
  assert.equal(cleanGroup(undefined), '');
  assert.equal(cleanGroup(null), '');
  assert.equal(cleanGroup('   '), '');
  assert.throws(() => cleanGroup('x'.repeat(MAX_GROUP_CHARS + 1)), (e) => e instanceof InvalidGroupError && e.message === `group must be at most ${MAX_GROUP_CHARS} characters`);
  assert.throws(() => cleanGroup(5), (e) => e instanceof InvalidGroupError && e.message === 'group must be text');
});

test('people cleanGroup still reports a 400 PeopleError', async () => {
  const { cleanGroup, PeopleError } = await import('../modules/people/people.service.js');
  assert.throws(() => cleanGroup(5), (e) => e instanceof PeopleError && e.status === 400 && e.code === 'INVALID_GROUP');
});
