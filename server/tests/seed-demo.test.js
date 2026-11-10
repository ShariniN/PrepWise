// seed-demo's fake dashboard data, checked as pure functions (no database): shape, schema validity, determinism,
// and that the lecturer dashboard shows realistic results from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import './helpers.js';
import Interview from '../models/Interview.js';
import CVAnalysis from '../models/CvAnalysis.js';
import { demoPlan, buildDemoActivity, prng } from '../scripts/demoActivity.js';
import { DEMO_PASSWORDS, ACTIVITY_SLUGS, DEMOS } from '../scripts/seed-demo.js';
import * as m from '../modules/lecturer/lecturer.metrics.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const inst = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const students = Array.from({ length: 40 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), email: i ? `student${i + 1}@demo-a.test` : 'student@email.com' }));
const build = () => buildDemoActivity({ students, institutionId: inst, now: NOW });
const sid = String;

test('fixed demo logins: admin, lecturer and student only; activity only for University A', () => {
  assert.deepEqual(DEMO_PASSWORDS, { university_admin: 'admin@123', lecturer: 'lecturer@123', student: 'student@123' });
  assert.deepEqual(ACTIVITY_SLUGS, ['demo-a']);
  assert.equal(DEMOS[0].loginDomain, 'email.com');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '../scripts/seed-demo.js'), 'utf8');
  assert.doesNotMatch(src, /careers@|career_officer|Course|Cohort|Enrollment/);
});

test('plan: 40 students in two groups of 20, 25 with data including the fixed student login', () => {
  const plan = demoPlan({ count: 40 });
  assert.equal(plan.length, 40);
  assert.equal(plan.filter((p) => p.group === 'Group 1').length, 20);
  assert.equal(plan.filter((p) => p.group === 'Group 2').length, 20);
  assert.equal(plan.filter((p) => p.hasData).length, 25);
  assert.equal(plan[0].hasData, true);
  assert.ok(plan.filter((p) => p.hasData).every((p) => p.interviews >= 2 && p.interviews <= 3));
});

test('activity: 2-3 completed interviews and one CV analysis per student with data, none for the rest', () => {
  const a = build();
  const plan = demoPlan({ count: 40 });
  for (const [i, s] of students.entries()) {
    const ivs = a.interviews.filter((x) => sid(x.userId) === sid(s._id));
    const cvs = a.cvAnalyses.filter((x) => sid(x.userId) === sid(s._id));
    assert.equal(ivs.length, plan[i].interviews, `student ${i}`);
    assert.equal(cvs.length, plan[i].hasData ? 1 : 0, `student ${i}`);
    assert.ok(ivs.every((x) => x.status === 'completed' && x.completedAt <= NOW));
    assert.ok(a.lastActive[i] instanceof Date && a.lastActive[i] <= NOW);
  }
  assert.ok(a.interviews.every((x) => sid(x.institutionId) === sid(inst)));
  assert.equal(new Set(a.cvAnalyses.map((c) => c.resumeHash)).size, a.cvAnalyses.length, 'unique (userId, resumeHash)');
});

test('every seeded document passes the real Mongoose schema', () => {
  const a = build();
  for (const doc of a.interviews) assert.equal(new Interview(doc).validateSync(), undefined);
  for (const doc of a.cvAnalyses) assert.equal(new CVAnalysis(doc).validateSync(), undefined);
});

test('seeded data is clearly marked and follows the delivery-metrics and CV contracts', () => {
  const a = build();
  const responses = a.interviews.flatMap((x) => x.responses);
  assert.ok(a.interviews.every((x) => /Demo data/.test(x.overallFeedback.feedback.generalFeedback) && /Demo/.test(x.jobDescription)));
  assert.ok(responses.every((r) => /Demo data/.test(r.feedback.detailedAnalysis)));
  assert.ok(responses.some((r) => r.feedback.source === 'fallback'), 'a few fallback answers show the exclusion');
  assert.ok(responses.filter((r) => r.feedback.source === 'fallback').length < responses.length / 10);
  const dms = responses.map((r) => r.deliveryMetrics);
  assert.ok(dms.every((d) => d && typeof d.cameraUsed === 'boolean'));
  for (const d of dms) assert.deepEqual(m.cleanDelivery(d), d, 'already valid against the contract');
  const off = dms.filter((d) => !d.cameraUsed);
  assert.ok(off.length > 0 && off.length < dms.length);
  assert.ok(off.every((d) => d.eyeContactPct === null && d.faceVisiblePct === null && d.lookAwayCount === null && d.headMovement === null));
  for (const c of a.cvAnalyses) {
    assert.match(c.results[0].message, /Demo data/);
    for (const r of c.results) {
      assert.equal(r.scoreBreakdown.aiAvailable, true);
      assert.equal(r.scoreBreakdown.model, 'seed-demo');
      assert.deepEqual([...r.scoreBreakdown.matchedSkills, ...r.scoreBreakdown.missingSkills].sort(), [...r.scoreBreakdown.requiredSkills].sort());
      assert.ok(r.matchPercentage >= 0 && r.matchPercentage <= 100);
    }
  }
});

test('the same seed and clock give the same data', () => {
  const strip = (a) => JSON.stringify(a);
  assert.equal(strip(build()), strip(build()));
  assert.notEqual(prng(1)(), prng(2)());
});

test('the lecturer dashboard shows varied, realistic results from the demo data', () => {
  const a = build();
  const plan = demoPlan({ count: 40 });
  const rows = students.map((s, i) => m.studentRow(
    { _id: s._id, name: `S${i}`, email: s.email, group: plan[i].group, lastActive: a.lastActive[i] },
    { interviews: a.interviews.filter((x) => sid(x.userId) === sid(s._id)), cvAnalyses: a.cvAnalyses.filter((x) => sid(x.userId) === sid(s._id)), attempts: [] },
    NOW,
  ));
  const codes = new Set(rows.flatMap((r) => r.needsAttention.map((x) => x.code)));
  for (const c of m.ATTENTION_CODES) assert.ok(codes.has(c), `some student shows ${c}`);
  assert.ok(rows.some((r) => r.needsAttention.length === 0), 'some students are fine');
  const ov = m.overview(rows, NOW);
  assert.equal(ov.totals.students, 40);
  assert.equal(ov.totals.withMockInterview, 25);
  assert.equal(ov.totals.withCvAnalysis, 25);
  assert.ok(ov.totals.active30d > 0 && ov.totals.active30d < 40);
  assert.ok(ov.interview.overall.average > 30 && ov.interview.overall.average < 90);
  for (const c of m.CATEGORIES) assert.notEqual(ov.interview[c].average, null, c);
  assert.ok(ov.interview.excludedFallbackAnswers > 0);
  assert.notEqual(ov.cv.averageBestMatch.average, null);
  assert.equal(ov.cv.topMissingSkills.length, 10);
  assert.equal(ov.delivery.insufficientData, false);
  assert.ok(ov.delivery.cameraUsedPct.average > 50 && ov.delivery.cameraUsedPct.average < 100);
  assert.notEqual(ov.delivery.eyeContactPct.average, null);
  assert.equal(rows[0].interviewsCompleted >= 2, true, 'the fixed student login has interviews');
});
