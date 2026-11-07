// Phase 3B analytics: lecturer, career officer and admin views. No database; repositories are in-memory fakes.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installAnalyticsWorld } from './support/analyticsWorld.js';
import * as agg from '../analytics/aggregate.js';
import app from '../app.js';

let w, db, adminA, lecA1, lecA2, lecB, coA, adminB, course, cohort, students, stuB, qCode, qTopic2;
const as = (u) => ({ Cookie: w.cookie(u) });
const ago = (days, extraMs = 0) => new Date(Date.now() - days * 86400000 + extraMs);

const enrol = (user, c = course, h = cohort) =>
  w.enrollments.push({ institutionId: user.institutionId, userId: user._id, kind: 'student', courseId: c._id, cohortId: h._id });

beforeEach(() => {
  w = makeWorld();
  w.install();
  db = installAnalyticsWorld(w);
  mock.method(console, 'error', () => {});
  adminA = w.addUser({ email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecA1 = w.addUser({ email: 'l1@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  coA = w.addUser({ email: 'co@a.edu', role: 'career_officer', institutionId: IDS.instA });
  adminB = w.addUser({ email: 'admin@b.edu', role: 'university_admin', institutionId: IDS.instB });
  course = { _id: newId(), institutionId: IDS.instA, code: 'CS101', title: 'Intro', ownerId: lecA1._id };
  cohort = { _id: newId(), institutionId: IDS.instA, courseId: course._id, name: 'G1' };
  w.courses.push(course);
  w.cohorts.push(cohort);
  students = ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Flo'].map((n) => w.addUser({ name: n, email: `${n.toLowerCase()}@a.edu`, role: 'student', institutionId: IDS.instA }));
  students.forEach((s) => enrol(s));
  stuB = w.addUser({ name: 'Zed', email: 'z@b.edu', role: 'student', institutionId: IDS.instB });
  qCode = db.addQuestion({ institutionId: IDS.instA, title: 'Sum', topic: ['arrays'] }, [
    { input: '1', expectedOutput: '1', visible: true }, { input: '2', expectedOutput: '4', visible: false }, { input: '3', expectedOutput: '9', visible: false },
  ]);
  qTopic2 = db.addQuestion({ institutionId: IDS.instA, title: 'Fact', topic: ['recursion'] }, [{ input: '1', expectedOutput: '1', visible: true }]);
});
afterEach(() => mock.restoreAll());

const sub = (u, q, fields) => db.addAttempt({ institutionId: IDS.instA, userId: u._id, questionId: q._id, ...fields });
const pt = (...passed) => passed.map((p, i) => ({ testId: String(i), visible: i === 0, passed: p, verdict: p ? 'accepted' : 'wrong_answer' }));
const q = (path, user, query = {}) => request(app).get(path).query(query).set(as(user));
const scope = () => ({ courseId: String(course._id) });

// ---------------------------------------------------------------- access control
test('students and unauthenticated users never reach analytics or grading; roles are separated', async () => {
  const urls = ['/api/analytics/lecturer/failure-patterns', '/api/analytics/careers/readiness', '/api/analytics/admin/overview', '/api/grading/queue'];
  for (const u of urls) {
    assert.equal((await request(app).get(u)).status, 401, u);
    assert.equal((await q(u, students[0])).status, 403, u);
  }
  assert.equal((await q('/api/analytics/careers/readiness', lecA1)).status, 403);
  assert.equal((await q('/api/analytics/admin/overview', lecA1)).status, 403);
  assert.equal((await q('/api/analytics/admin/overview', coA)).status, 403);
  assert.equal((await q('/api/analytics/lecturer/topic-heatmap', coA, scope())).status, 403);
  assert.equal((await q('/api/grading/queue', coA)).status, 403);
});

test('lecturer sees only their own course; another lecturer, another university and bad ids get 404', async () => {
  const p = '/api/analytics/lecturer/topic-heatmap';
  assert.equal((await q(p, lecA1, scope())).status, 200);
  assert.equal((await q(p, adminA, scope())).status, 200);
  assert.equal((await q(p, lecA2, scope())).status, 404, 'unassigned lecturer');
  assert.equal((await q(p, lecB, scope())).status, 404, 'other university');
  assert.equal((await q(p, adminB, scope())).status, 404, 'other university admin');
  assert.equal((await q(p, lecA1, { courseId: 'nope' })).status, 404);
  assert.equal((await q(p, lecA1, {})).status, 400);
  assert.equal((await q(p, lecA1, { ...scope(), cohortId: newId() })).status, 404);
  w.enrollments.push({ institutionId: IDS.instA, userId: lecA2._id, kind: 'lecturer', courseId: course._id, cohortId: null });
  assert.equal((await q(p, lecA2, scope())).status, 200, 'assigned lecturer');
});

test('a lecturer cohort query only returns that cohort; other universities students never appear', async () => {
  const h2 = { _id: newId(), institutionId: IDS.instA, courseId: course._id, name: 'G2' };
  w.cohorts.push(h2);
  const extra = w.addUser({ name: 'Gus', email: 'g@a.edu', role: 'student', institutionId: IDS.instA });
  enrol(extra, course, h2);
  enrol(stuB);
  sub(stuB, qCode, { score: 100, verdict: 'accepted' });
  const all = await q('/api/analytics/lecturer/topic-heatmap', lecA1, scope());
  assert.equal(all.body.rows.length, 7);
  assert.equal(all.body.rows.some((r) => r.name === 'Zed'), false);
  const one = await q('/api/analytics/lecturer/topic-heatmap', lecA1, { ...scope(), cohortId: String(h2._id) });
  assert.deepEqual(one.body.rows.map((r) => r.name), ['Gus']);
});

// ---------------------------------------------------------------- failure patterns
test('failure patterns: fewer than 5 students returns a notice and no percentages', async () => {
  students.slice(0, 4).forEach((s) => sub(s, qCode, { score: 33, verdict: 'wrong_answer', perTest: pt(true, false, false) }));
  const res = await q('/api/analytics/lecturer/failure-patterns', lecA1, scope());
  assert.equal(res.status, 200);
  assert.equal(res.body.questions[0].insufficientData, true);
  assert.equal(res.body.questions[0].n, 4);
  assert.doesNotMatch(JSON.stringify(res.body.questions), /Percent|failCount|"tests"/);
});

test('failure patterns: per test failure rates, hidden tests visible to staff, latest submission counts', async () => {
  students.slice(0, 5).forEach((s, i) => sub(s, qCode, { score: 33, verdict: 'wrong_answer', perTest: pt(true, false, i < 3 ? false : true), createdAt: ago(2) }));
  sub(students[5], qCode, { score: 100, verdict: 'accepted', perTest: pt(true, true, true) });
  // Ann improves later: her latest submission passes everything
  sub(students[0], qCode, { score: 100, verdict: 'accepted', perTest: pt(true, true, true), createdAt: ago(1) });
  const res = await q('/api/analytics/lecturer/failure-patterns', lecA1, scope());
  const item = res.body.questions[0];
  assert.equal(item.n, 6);
  assert.equal(item.failingStudents, 4);
  assert.equal(item.failingPercent, 66.7);
  assert.equal(item.tests[0].index, 2); // hidden test 2 is the worst: 4 of 6 failed
  assert.equal(item.tests[0].visible, false);
  assert.equal(item.tests[0].failCount, 4);
  assert.equal(item.tests[0].expectedOutput, '4', 'staff may see hidden test data');
  assert.equal(item.tests[1].failCount, 2);
});

// ---------------------------------------------------------------- exclusion
test('fallback-sourced and unconfirmed AI scores are excluded and counted', async () => {
  sub(students[0], qCode, { score: 100, verdict: 'accepted', scoreSource: 'tests' });
  sub(students[1], qCode, { score: 100, verdict: 'accepted' });
  sub(students[2], qCode, { score: 90, verdict: 'accepted', scoreSource: 'fallback' });
  sub(students[3], qCode, { score: 80, verdict: 'accepted', scoreSource: 'ai' });
  sub(students[4], qTopic2, { score: null, verdict: 'pending_review', needsReview: true, review: { aiSuggestion: { total: 5 } } });
  sub(students[5], qCode, { score: 40, verdict: 'reviewed', scoreSource: 'human' });
  const res = await q('/api/analytics/lecturer/topic-heatmap', lecA1, scope());
  assert.equal(res.body.excluded, 3);
  const arrays = res.body.columns.find((c) => c.topic === 'arrays');
  assert.equal(arrays.studentsWithData, 3);
  assert.equal(arrays.mean, 80); // (100 + 100 + 40) / 3
  const row = (n) => res.body.rows.find((r) => r.name === n);
  assert.deepEqual(row('Cy').values.filter((v) => v != null), []);
});

// ---------------------------------------------------------------- heat map
test('topic heat map: null when no attempts, column summaries, deterministic ordering regardless of insertion order', async () => {
  const data = [
    [0, qCode, 100], [1, qCode, 60], [2, qCode, 60], [3, qTopic2, 20], [1, qTopic2, 80], [0, qTopic2, 100], [4, qTopic2, 80],
  ];
  const seed = (order) => { db.attempts.length = 0; order.forEach(([i, qq, s]) => sub(students[i], qq, { score: s, verdict: s === 100 ? 'accepted' : 'wrong_answer' })); };
  seed(data);
  const a = await q('/api/analytics/lecturer/topic-heatmap', lecA1, scope());
  seed([...data].reverse());
  const b = await q('/api/analytics/lecturer/topic-heatmap', lecA1, scope());
  assert.deepEqual(a.body, b.body);
  assert.deepEqual(a.body.topics, ['arrays', 'recursion']); // arrays mean 73.3 > recursion mean 70
});

test('topic heat map values', async () => {
  sub(students[0], qCode, { score: 100, verdict: 'accepted' });
  sub(students[0], qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(1) }); // best is kept
  sub(students[1], qCode, { score: 40, verdict: 'wrong_answer' });
  sub(students[1], qTopic2, { score: 90, verdict: 'wrong_answer' });
  const res = await q('/api/analytics/lecturer/topic-heatmap', lecA1, scope());
  assert.deepEqual(res.body.topics, ['recursion', 'arrays'].sort((x, y) => {
    const m = { arrays: 70, recursion: 90 };
    return m[y] - m[x];
  }));
  const ann = res.body.rows.find((r) => r.name === 'Ann');
  assert.equal(ann.values[res.body.topics.indexOf('arrays')], 100);
  assert.equal(ann.values[res.body.topics.indexOf('recursion')], null);
  const arrays = res.body.columns.find((c) => c.topic === 'arrays');
  assert.deepEqual([arrays.mean, arrays.studentsWithData, arrays.studentsTotal, arrays.belowFiftyPercent], [70, 2, 6, 50]);
  assert.equal(res.body.rows[0].name, 'Ann'); // mean 100 first, students without data last
  assert.equal(res.body.rows.at(-1).mean, null);
});

// ---------------------------------------------------------------- students needing help
test('students needing help: machine-readable reasons, no ranking score, thresholds from query', async () => {
  const [ann, bob, cy, di] = students;
  // Ann: last submission 20 days ago
  sub(ann, qCode, { score: 100, verdict: 'accepted', createdAt: ago(20) });
  // Bob: declining on recursion
  [80, 60, 40].forEach((s, i) => sub(bob, qTopic2, { score: s, verdict: 'wrong_answer', createdAt: ago(5 - i) }));
  // Cy: three compile errors
  [1, 2, 3].forEach((i) => sub(cy, qCode, { score: 0, verdict: 'compile_error', createdAt: ago(4 - i) }));
  // Di: only ran code, never submitted
  db.addAttempt({ institutionId: IDS.instA, userId: di._id, questionId: qCode._id, runKind: 'run', createdAt: ago(1) });
  // Ed and Flo: no attempts at all => never_submitted
  const res = await q('/api/analytics/lecturer/students-needing-help', lecA1, scope());
  assert.equal(res.status, 200);
  const by = Object.fromEntries(res.body.students.map((s) => [s.name, s.reasons.map((r) => r.code)]));
  assert.deepEqual(by.Ann, ['no_recent_attempts']);
  assert.deepEqual(by.Bob, ['declining_topic']);
  assert.deepEqual(by.Cy.sort(), ['declining_topic', 'repeated_compile_errors'].filter((c) => c !== 'declining_topic').concat([]));
  assert.deepEqual(by.Di, ['never_submitted']);
  assert.deepEqual(by.Ed, ['never_submitted']);
  assert.equal(res.body.students.find((s) => s.name === 'Bob').reasons[0].topic, 'recursion');
  assert.equal(res.body.students.find((s) => s.name === 'Ann').reasons[0].days, 20);
  assert.deepEqual(res.body.students.map((s) => s.name), ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Flo']); // alphabetical, not a ranking
  assert.doesNotMatch(JSON.stringify(res.body), /riskScore|"risk"|"rank"/i);
  const relaxed = await q('/api/analytics/lecturer/students-needing-help', lecA1, { ...scope(), inactiveDays: 30, compileErrors: 4 });
  const by2 = Object.fromEntries(relaxed.body.students.map((s) => [s.name, s.reasons.map((r) => r.code)]));
  assert.equal(by2.Ann, undefined);
  assert.equal(by2.Cy, undefined);
  assert.equal(relaxed.body.thresholds.inactiveDays, 30);
});

// ---------------------------------------------------------------- question quality
test('discrimination index math: top vs bottom quartile pass rate', () => {
  const ability = new Map([['a', 90], ['b', 80], ['c', 70], ['d', 60], ['e', 50], ['f', 40], ['g', 30], ['h', 20]]);
  // quartile size = floor(8/4) = 2: top {a,b}, bottom {g,h}
  assert.deepEqual(agg.discrimination({ ability, passed: new Set(['a', 'b', 'c', 'd']) }),
    { index: 1, topQuartilePassRate: 1, bottomQuartilePassRate: 0, ranked: 8 });
  assert.equal(agg.discrimination({ ability, passed: new Set(['a', 'g', 'h']) }).index, -0.5);
  assert.equal(agg.discrimination({ ability, passed: new Set(['a', 'c', 'h']) }).index, 0);
  assert.equal(agg.discrimination({ ability: new Map([['a', 1], ['b', 2]]), passed: new Set() }).index, null, 'fewer than 5 students');
});

test('question quality: pass rate, discrimination, median time to solve, badly-worded flag and exposure', async () => {
  const qAbility = db.addQuestion({ institutionId: IDS.instA, title: 'Ability', topic: ['arrays'] }, []);
  const extra = [w.addUser({ name: 'Gus', email: 'g@a.edu', role: 'student', institutionId: IDS.instA }), w.addUser({ name: 'Hal', email: 'h@a.edu', role: 'student', institutionId: IDS.instA })];
  extra.forEach((s) => enrol(s));
  const eight = [...students, ...extra]; // 8 students, ability scores 90..20
  eight.forEach((s, i) => sub(s, qAbility, { score: 90 - i * 10, verdict: i === 0 ? 'accepted' : 'wrong_answer' }));
  // target question: strong students FAIL, weak ones pass => negative D and flagged
  const passes = new Set([5, 6, 7]);
  eight.forEach((s, i) => {
    db.addAttempt({ institutionId: IDS.instA, userId: s._id, questionId: qTopic2._id, runKind: 'draft', createdAt: ago(1, 0) });
    sub(s, qTopic2, { score: passes.has(i) ? 100 : 0, verdict: passes.has(i) ? 'accepted' : 'wrong_answer', createdAt: ago(1, (i + 1) * 60000) });
  });
  const res = await q('/api/analytics/lecturer/question-quality', lecA1, scope());
  assert.equal(res.status, 200);
  const item = res.body.questions.find((x) => x.title === 'Fact');
  assert.equal(item.students, 8);
  assert.equal(item.passRatePercent, 37.5);
  assert.equal(item.topQuartilePassRate, 0);
  assert.equal(item.bottomQuartilePassRate, 1);
  assert.equal(item.discriminationIndex, -1);
  assert.equal(item.flags.maybeBadlyWorded, true);
  assert.equal(item.medianMinutesToSolve, 7); // solvers at +6, +7, +8 minutes => median 7
  assert.equal(item.usage.percentOfScope, 100);
  assert.equal(item.usage.overExposed, true);
});

// ---------------------------------------------------------------- activity
test('activity returns zero-filled attempts per day for the scope only', async () => {
  sub(students[0], qCode, { score: 10, verdict: 'wrong_answer', createdAt: ago(0, -1000) });
  db.addAttempt({ institutionId: IDS.instA, userId: students[1]._id, questionId: qCode._id, runKind: 'run', createdAt: ago(0, -2000) });
  db.addAttempt({ institutionId: IDS.instA, userId: students[1]._id, questionId: qCode._id, runKind: 'draft', createdAt: ago(0, -2000) });
  sub(stuB, qCode, { score: 10, verdict: 'wrong_answer' });
  const res = await q('/api/analytics/lecturer/activity', lecA1, { ...scope(), days: 7 });
  assert.equal(res.body.daily.length, 7);
  const today = res.body.daily.at(-1);
  assert.equal(today.attempts, 2, 'drafts are not counted, other universities are not counted');
  assert.equal(today.submissions, 1);
  assert.equal(today.activeStudents, 2);
  assert.equal(res.body.daily[0].attempts, 0);
});

// ---------------------------------------------------------------- careers
const addInterview = (u, fields = {}) => db.interviews.push({
  _id: newId(), institutionId: u.institutionId, userId: u._id, status: 'completed', createdAt: new Date(), resumeText: 'SECRET-CV-TEXT', jobDescription: 'SECRET-JD',
  overallFeedback: { feedback: { categoryScores: { behavioralSkills: 80, technicalKnowledge: 60, codingAbility: 40, communication: 70 } } },
  responses: [{ feedback: { source: 'ai' } }], ...fields,
});

test('careers readiness: institution aggregates, fallback interviews excluded, no code or CV text, tenancy', async () => {
  const [ann, bob] = students;
  db.cv.push({ institutionId: IDS.instA, userId: ann._id, resumeText: 'SECRET-CV-TEXT' });
  addInterview(ann);
  addInterview(ann, { overallFeedback: { feedback: { categoryScores: { behavioralSkills: 40, technicalKnowledge: 20, codingAbility: 0, communication: 30 } } } });
  addInterview(bob, { responses: [{ feedback: { source: 'fallback' } }] });
  sub(ann, qCode, { score: 100, verdict: 'accepted', source: 'SECRET-SOURCE-CODE' });
  enrol(stuB); // wrong university enrolment row must never surface
  db.cv.push({ institutionId: IDS.instB, userId: stuB._id });
  const res = await q('/api/analytics/careers/readiness', coA);
  assert.equal(res.status, 200, res.text);
  const text = JSON.stringify(res.body);
  assert.doesNotMatch(text, /SECRET|expectedOutput|perTest|input/);
  assert.equal(text.includes('Zed'), false);
  const rows = res.body.programmes[0].cohorts[0].students;
  const annRow = rows.find((r) => r.name === 'Ann');
  assert.equal(annRow.cvAnalyses, 1);
  assert.equal(annRow.mockInterviewsCompleted, 2);
  assert.equal(annRow.practiceSolved, 1);
  assert.equal(annRow.interviewAverages.behavioralSkills, 60);
  const bobRow = rows.find((r) => r.name === 'Bob');
  assert.equal(bobRow.mockInterviewsCompleted, 1);
  assert.equal(bobRow.interviewAverages.behavioralSkills, null);
  assert.equal(res.body.excluded.fallbackInterviews, 1);
  assert.equal((await q('/api/analytics/careers/readiness', adminA)).status, 200);
  assert.equal((await q('/api/analytics/careers/readiness', coA, { courseId: newId() })).status, 404);
});

test('careers coverage gives percentages per cohort without student rows', async () => {
  db.cv.push({ institutionId: IDS.instA, userId: students[0]._id }, { institutionId: IDS.instA, userId: students[1]._id });
  addInterview(students[0]);
  const res = await q('/api/analytics/careers/coverage', coA);
  assert.equal(res.body.institution.students, 6);
  assert.equal(res.body.institution.withCvAnalysisPercent, 33.3);
  assert.equal(res.body.institution.withMockInterviewPercent, 16.7);
  assert.equal(res.body.programmes[0].cohorts[0].students, 6);
  assert.equal(res.body.programmes[0].cohorts[0].name, 'G1');
  assert.equal(res.body.programmes[0].cohorts[0].students.name, undefined);
  assert.equal(JSON.stringify(res.body).includes('email'), false);
});

test('readiness CSV contains the table only: no CV text, formula cells neutralised, audited', async () => {
  const evil = w.addUser({ name: '=HYPERLINK("x")', email: 'evil@a.edu', role: 'student', institutionId: IDS.instA });
  enrol(evil);
  db.cv.push({ institutionId: IDS.instA, userId: students[0]._id, resumeText: 'SECRET-CV-TEXT' });
  addInterview(students[0]);
  const res = await request(app).get('/api/analytics/careers/readiness.csv').set(as(coA));
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.doesNotMatch(res.text, /SECRET/);
  assert.match(res.text.split('\r\n')[0], /^programme,cohort,student,email,cv_analyses/);
  assert.equal(res.text.split('\r\n').filter(Boolean).length, 8);
  assert.match(res.text, /"'=HYPERLINK\(""x""\)"/);
  assert.ok(w.audit.some((a) => a.action === 'analytics.export.readiness'));
  assert.equal((await request(app).get('/api/analytics/careers/readiness.csv').set(as(students[0]))).status, 403);
});

test('skills gap: needs 5 students, lists skills below the threshold', async () => {
  const mk = (u, level) => db.skills.push({ institutionId: u.institutionId, userId: u._id, createdAt: new Date(), skills: [{ name: 'SQL', category: 'Data', proficiencyLevel: level }, { name: 'Python', category: 'Code', proficiencyLevel: 8 }] });
  students.slice(0, 4).forEach((s) => mk(s, 3));
  const few = await q('/api/analytics/careers/skills-gap', coA);
  assert.equal(few.body.insufficientData, true);
  mk(students[4], 4);
  const res = await q('/api/analytics/careers/skills-gap', coA);
  assert.equal(res.body.gaps.length, 1);
  assert.equal(res.body.gaps[0].skill, 'SQL');
  assert.equal(res.body.gaps[0].meanProficiency, 3.2);
  assert.equal(res.body.skills.length, 2);
});

// ---------------------------------------------------------------- admin
test('admin overview: active students vs limit, improvement, AI usage; other universities never counted', async () => {
  students.slice(0, 2).forEach((s) => sub(s, qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(3) }));
  sub(students[2], qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(20) });
  sub(stuB, qCode, { institutionId: IDS.instB, score: 50, verdict: 'wrong_answer' });
  // five students improve between a first and a later attempt
  students.slice(0, 5).forEach((s) => { sub(s, qTopic2, { score: 40, verdict: 'wrong_answer', createdAt: ago(10) }); sub(s, qTopic2, { score: 80, verdict: 'wrong_answer', createdAt: ago(9) }); });
  db.aiCalls[IDS.instA] = 150;
  db.aiCalls[IDS.instB] = 999;
  const res = await q('/api/analytics/admin/overview', adminA);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.adoption.activeStudents7d, 2);
  assert.equal(res.body.adoption.activeStudents30d, 6 - 1);
  assert.equal(res.body.adoption.contractedStudentLimit, 3);
  assert.equal(res.body.aiUsage.calls, 150);
  assert.equal(res.body.aiUsage.cap, 20000);
  assert.equal(res.body.improvement.cohorts[0].meanFirst, 40);
  assert.equal(res.body.improvement.cohorts[0].meanLatest, 80);
  assert.equal(res.body.improvement.cohorts[0].delta, 40);
  assert.equal(JSON.stringify(res.body).includes('Zed'), false);
  const b = await q('/api/analytics/admin/overview', adminB);
  assert.equal(b.body.aiUsage.calls, 999);
  assert.equal(b.body.adoption.activeStudents30d, 1);
});

test('evidence summary is counts only; includeStudents=1 adds students and writes an audit entry', async () => {
  sub(students[0], qCode, { score: 50, verdict: 'wrong_answer', createdAt: ago(2) });
  addInterview(students[0]);
  const plain = await q('/api/analytics/admin/evidence', adminA);
  assert.equal(plain.status, 200);
  assert.equal(plain.body.students, undefined);
  assert.equal(plain.body.summary.practiceSubmissionsTotal, 1);
  assert.equal(plain.body.summary.mockInterviewsCompleted, 1);
  assert.equal(JSON.stringify(plain.body).includes('@a.edu'), false);
  assert.equal(w.audit.some((a) => a.action === 'analytics.export.evidence_students'), false);
  const withStudents = await q('/api/analytics/admin/evidence', adminA, { includeStudents: '1' });
  assert.equal(withStudents.body.students.length, 6);
  const entry = w.audit.find((a) => a.action === 'analytics.export.evidence_students');
  assert.ok(entry);
  assert.equal(String(entry.institutionId), IDS.instA);
  const csv = await request(app).get('/api/analytics/admin/evidence').query({ format: 'csv' }).set(as(adminA));
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /practiceSubmissionsTotal,1/);
  assert.equal(csv.text.includes('@a.edu'), false);
  assert.equal((await q('/api/analytics/admin/evidence', lecA1)).status, 403);
});
