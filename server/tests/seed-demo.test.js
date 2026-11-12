// seed-demo's fake dashboard data, checked as pure functions (no database): shape, schema validity, determinism,
// and that the dashboard shows realistic results from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import './helpers.js';
import Interview from '../models/Interview.js';
import CVAnalysis from '../models/CvAnalysis.js';
import { demoPlan, buildDemoActivity, prng, DEMO_GROUPS } from '../scripts/demoActivity.js';
import { DEMO_PASSWORDS, ACTIVITY_SLUGS, DEMOS, LECTURER_GROUPS, STAFF } from '../scripts/seed-demo.js';
import { DEFAULT_TARGET_ROLES } from '../config/defaultTargetRoles.js';
import { nextLevel, adaptiveScore, startLevelFor, SLOT_TYPES, LEVELS } from '../modules/interviews/interviews.adaptive.js';
import * as m from '../modules/dashboard/dashboard.metrics.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const inst = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const students = Array.from({ length: 40 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), email: i ? `student${i + 1}@demo-a.test` : 'student@email.com' }));
const roles = DEFAULT_TARGET_ROLES.map((r, i) => ({ ...r, _id: new mongoose.Types.ObjectId(`bbbbbbbbbbbbbbbbbbbbbb0${i}`) }));
const build = () => buildDemoActivity({ students, institutionId: inst, roles, now: NOW });
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
  assert.ok(a.interviews.every((x) => /Demo data/.test(x.overallFeedback.feedback.generalFeedback) && /Demo data/.test(x.resumeText)));
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

test('the dashboard shows varied, realistic results from the demo data', () => {
  const a = build();
  const plan = demoPlan({ count: 40 });
  const rows = students.map((s, i) => m.studentRow(
    { _id: s._id, name: `S${i}`, email: s.email, group: plan[i].group, lastActive: a.lastActive[i] },
    { interviews: a.interviews.filter((x) => sid(x.userId) === sid(s._id)), cvAnalyses: a.cvAnalyses.filter((x) => sid(x.userId) === sid(s._id)), attempts: [] },
    NOW,
  ));
  const codes = new Set(rows.flatMap((r) => r.attention.map((x) => x.code)));
  for (const c of m.ATTENTION_CODES) assert.ok(codes.has(c), `some student shows ${c}`);
  assert.ok(rows.some((r) => r.attention.length === 0), 'some students are fine');
  const ov = m.overview(rows, NOW);
  assert.equal(ov.students, 40);
  assert.ok(ov.activeLast14Days > 0 && ov.activeLast14Days < 40);
  assert.ok(ov.avgInterviewScore > 30 && ov.avgInterviewScore < 90);
  assert.equal(ov.studentsWithInterviewScore, 25);
  assert.equal(rows.filter((r) => r.trend.length >= 2).length > 0, true, 'some students have a trend');
  assert.equal(rows[0].lastInterviewScore != null, true, 'the fixed student login has interviews');
});

const byStudent = (a, i) => a.interviews.filter((x) => sid(x.userId) === sid(students[i]._id)).sort((x, y) => x.completedAt - y.completedAt);

test('every demo student has a target role, spread across the default roles', () => {
  const plan = demoPlan({ count: 40 });
  assert.ok(plan.every((p) => Number.isInteger(p.roleIndex) && p.roleIndex >= 0 && p.roleIndex < roles.length));
  assert.equal(new Set(plan.map((p) => p.roleIndex)).size, roles.length, 'all five roles are used');
  const a = build();
  assert.equal(a.targetRoleIds.length, 40);
  const known = new Set(roles.map((r) => sid(r._id)));
  assert.ok(a.targetRoleIds.every((id) => known.has(sid(id))));
});

test('demo interviews have 5 questions with levels and levelReached', () => {
  const a = build();
  assert.ok(a.interviews.length > 0);
  for (const iv of a.interviews) {
    assert.equal(iv.questions.length, 5);
    assert.equal(iv.responses.length, 5);
    assert.ok(LEVELS.includes(iv.startLevel) && LEVELS.includes(iv.levelReached));
    assert.ok(iv.targetRoleId, 'the interview records the target role');
    assert.equal(iv.pool, undefined);
    let level = iv.startLevel;
    iv.questions.forEach((q, k) => {
      assert.equal(q.slot, k);
      assert.equal(q.type, SLOT_TYPES[k]);
      assert.equal(q.level, level, `slot ${k} is asked at the level the rule gives`);
      assert.equal(q.difficulty, level);
      assert.equal(iv.responses[k].level, level);
      assert.equal(iv.responses[k].questionId, q.questionId);
      level = nextLevel(level, adaptiveScore(iv.responses[k]));
    });
    assert.equal(iv.levelReached, level);
    const coding = iv.questions[2];
    assert.ok(coding.visibleTests.length > 0 && coding.hiddenTestCount >= 0 && !('tests' in coding), 'the coding slot carries visible tests only');
    assert.equal(new Interview(iv).validateSync(), undefined);
  }
  assert.ok(new Set(a.interviews.map((x) => x.levelReached)).size >= 2, 'the demo shows more than one level');
  assert.ok(a.interviews.some((iv) => iv.questions.some((q) => q.level !== iv.startLevel)), 'at least one interview moves between levels');
});

test('the next interview starts where the last one finished; the first one starts from the readiness answer', () => {
  const a = build();
  for (let i = 0; i < students.length; i++) {
    const ivs = byStudent(a, i);
    ivs.forEach((iv, k) => {
      if (k === 0) {
        assert.ok(iv.readiness);
        assert.equal(iv.startLevel, startLevelFor({ readiness: iv.readiness }));
      } else {
        assert.equal(iv.startLevel, ivs[k - 1].levelReached, `student ${i} interview ${k}`);
        assert.equal(iv.readiness ?? null, null);
      }
    });
  }
});

test('demo CV analyses have a target_role result', () => {
  const a = build();
  assert.ok(a.cvAnalyses.length > 0);
  for (const c of a.cvAnalyses) {
    const i = students.findIndex((s) => sid(s._id) === sid(c.userId));
    assert.equal(sid(c.targetRoleId), sid(a.targetRoleIds[i]));
    assert.deepEqual(c.jobDescriptions, []);
    assert.equal(c.results.length, 1);
    const r = c.results[0];
    assert.equal(r.kind, 'target_role');
    assert.equal(sid(r.targetRoleId), sid(c.targetRoleId));
    assert.equal(r.jobTitle, roles.find((x) => sid(x._id) === sid(c.targetRoleId)).title);
    assert.equal(m.isTargetRoleScore(r), true);
  }
});

test('some students show a score drop and some have gone quiet', () => {
  const a = build();
  const drops = students.filter((_, i) => { const s = byStudent(a, i).map((iv) => iv.overallFeedback.score); return s.length >= 2 && s.at(-2) - s.at(-1) >= 15; });
  assert.ok(drops.length >= 2, `drops: ${drops.length}`);
});

test('each demo lecturer has one assigned group', () => {
  const lecturers = STAFF.filter((s) => s.role === 'lecturer');
  assert.equal(lecturers.length, 2);
  for (const l of lecturers) assert.equal(LECTURER_GROUPS[l.name]?.length, 1, l.name);
  const groups = lecturers.map((l) => LECTURER_GROUPS[l.name][0]);
  assert.deepEqual([...groups].sort(), [...DEMO_GROUPS].sort(), 'one lecturer per group');
  assert.deepEqual(lecturers.map((l) => l.local), ['lecturer', 'lecturer2']);
});
