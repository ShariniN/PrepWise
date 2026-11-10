// Lecturer dashboard API (/api/lecturer). No database: repositories are in-memory fakes that return full documents.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installLecturerWorld } from './support/lecturerWorld.js';
import * as m from '../modules/lecturer/lecturer.metrics.js';
import app from '../app.js';

let w, db, lecA, adminA, lecB, studentsA, stuB;
const as = (u) => ({ Cookie: w.cookie(u) });
const get = (path, user, query = {}) => request(app).get(path).query(query).set(as(user));
const SECRETS = ['SECRET', 'hashed-password', 'invite-hash-xyz', '112233'];
const noSecrets = (text, where) => { for (const s of SECRETS) assert.equal(String(text).includes(s), false, `${where} leaks ${s}`); };

beforeEach(() => {
  w = makeWorld();
  w.install();
  db = installLecturerWorld(w);
  mock.method(console, 'error', () => {});
  const secret = { password: 'hashed-password', inviteTokenHash: 'invite-hash-xyz', verifyOtp: '112233', resetOtp: '112233', currentCV: { text: 'SECRET-CV-PROFILE', fileName: 'cv.pdf' } };
  lecA = w.addUser({ name: 'Lec A', email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA });
  adminA = w.addUser({ name: 'Admin A', email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecB = w.addUser({ name: 'Lec B', email: 'lec@b.edu', role: 'lecturer', institutionId: IDS.instB });
  studentsA = ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Flo'].map((n, i) => w.addUser({
    name: n, email: `${n.toLowerCase()}@a.edu`, role: 'student', institutionId: IDS.instA, group: i < 3 ? 'Group 1' : 'Group 2', lastActive: new Date(), ...secret,
  }));
  stuB = w.addUser({ name: 'Zed', email: 'z@b.edu', role: 'student', institutionId: IDS.instB, lastActive: new Date(), ...secret });
});
afterEach(() => mock.restoreAll());

const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, r]));

// ---------------------------------------------------------------- access
test('roles: anonymous 401, students and removed roles 403, lecturers and admins 200', async () => {
  const co = w.addUser({ email: 'co@a.edu', role: 'career_officer', institutionId: IDS.instA });
  const id = studentsA[0]._id;
  const iv = db.addInterview(studentsA[0]);
  for (const p of ['/api/lecturer/overview', '/api/lecturer/students', '/api/lecturer/students.csv', `/api/lecturer/students/${id}`, `/api/lecturer/students/${id}/interviews/${iv._id}`]) {
    assert.equal((await request(app).get(p)).status, 401, p);
    assert.equal((await get(p, studentsA[1])).status, 403, p);
    assert.equal((await get(p, co)).status, 403, p);
    assert.equal((await get(p, lecA)).status, 200, p);
    assert.equal((await get(p, adminA)).status, 200, p);
  }
});

test('tenancy: B never sees A; another university, bad ids, non-students and inactive students are 404', async () => {
  db.addInterview(studentsA[0]);
  db.addInterview(stuB);
  const b = await get('/api/lecturer/students', lecB);
  assert.deepEqual(b.body.students.map((s) => s.name), ['Zed']);
  assert.equal((await get('/api/lecturer/overview', lecB)).body.totals.students, 1);
  const a = await get('/api/lecturer/students', lecA);
  assert.equal(a.body.total, 6);
  assert.equal(JSON.stringify(a.body).includes('Zed'), false);
  assert.equal((await get(`/api/lecturer/students/${stuB._id}`, lecA)).status, 404);
  assert.equal((await get(`/api/lecturer/students/${studentsA[0]._id}`, lecB)).status, 404);
  assert.equal((await get('/api/lecturer/students/not-an-id', lecA)).status, 404);
  assert.equal((await get(`/api/lecturer/students/${newId()}`, lecA)).status, 404);
  assert.equal((await get(`/api/lecturer/students/${adminA._id}`, lecA)).status, 404, 'staff are not students');
  const invited = w.addUser({ name: 'Inv', email: 'inv@a.edu', role: 'student', institutionId: IDS.instA, status: 'invited' });
  const gone = w.addUser({ name: 'Gone', email: 'gone@a.edu', role: 'student', institutionId: IDS.instA, status: 'deactivated' });
  assert.equal((await get(`/api/lecturer/students/${invited._id}`, lecA)).status, 404);
  assert.equal((await get(`/api/lecturer/students/${gone._id}`, lecA)).status, 404);
  assert.equal((await get('/api/lecturer/students', lecA)).body.total, 6, 'invited and deactivated students are not listed');
  assert.equal(w.audit.filter((x) => x.action === 'lecturer.view_student').length, 0, 'failed lookups are not audited as views');
});

test('interview detail: must belong to that student and university', async () => {
  const ivAnn = db.addInterview(studentsA[0]);
  const ivB = db.addInterview(stuB);
  assert.equal((await get(`/api/lecturer/students/${studentsA[0]._id}/interviews/${ivAnn._id}`, lecA)).status, 200);
  assert.equal((await get(`/api/lecturer/students/${studentsA[1]._id}/interviews/${ivAnn._id}`, lecA)).status, 404, 'mismatched student');
  assert.equal((await get(`/api/lecturer/students/${stuB._id}/interviews/${ivB._id}`, lecA)).status, 404);
  assert.equal((await get(`/api/lecturer/students/${studentsA[0]._id}/interviews/${ivB._id}`, lecA)).status, 404);
  assert.equal((await get(`/api/lecturer/students/${studentsA[0]._id}/interviews/zzz`, lecA)).status, 404);
});

// ---------------------------------------------------------------- scoring rules
test('fallback-scored answers are excluded from every interview average and counted', async () => {
  // Stored overall score says 50; the honest answers average 80. A fallback answer of 10 must not pull it down.
  for (const s of studentsA.slice(0, 5)) {
    db.addInterview(s, { responses: [db.answer('behavioral', 80), db.answer('technical', 10, { feedback: { score: 10, source: 'fallback', communicationClarity: 1 } }), db.answer('coding', 0, { skipped: true, feedback: { score: 0, source: 'ai' } })] });
  }
  const ov = await get('/api/lecturer/overview', lecA);
  assert.equal(ov.status, 200, ov.text);
  assert.equal(ov.body.interview.overall.average, 80);
  assert.equal(ov.body.interview.overall.n, 5);
  assert.equal(ov.body.interview.behavioural.average, 80);
  assert.equal(ov.body.interview.technical.average, null, 'only fallback answers in technical');
  assert.equal(ov.body.interview.technical.n, 0);
  assert.equal(ov.body.interview.communication.average, 70, 'communication from the eligible answer only');
  assert.equal(ov.body.interview.excludedFallbackAnswers, 5);
  const row = byName((await get('/api/lecturer/students', lecA)).body.students).Ann;
  assert.equal(row.latestInterviewScore, 80);
  assert.equal(row.avgInterviewScore, 80);
  const prof = await get(`/api/lecturer/students/${studentsA[0]._id}`, lecA);
  assert.equal(prof.body.interviews[0].score, 80);
  assert.equal(prof.body.interviews[0].excludedFallbackAnswers, 1);
  assert.equal(prof.body.interviews[0].readinessLevel, 'Nearly Ready');
});

test('an interview scored only by the fallback has no score and does not count as low', async () => {
  db.addInterview(studentsA[0], { responses: [db.answer('behavioral', 5, { feedback: { score: 5, source: 'fallback' } })] });
  const row = byName((await get('/api/lecturer/students', lecA)).body.students).Ann;
  assert.equal(row.interviewsCompleted, 1);
  assert.equal(row.latestInterviewScore, null);
  assert.equal(row.needsAttention.some((r) => r.code === 'low_interview_score'), false);
});

test('CV results with aiAvailable === false are left out of match averages and counted', async () => {
  for (const s of studentsA.slice(0, 5)) db.addCv(s, [db.result(95, { aiAvailable: false }), db.result(60)]);
  db.addCv(studentsA[5], [db.result(99, { aiAvailable: false })]);
  const ov = await get('/api/lecturer/overview', lecA);
  assert.equal(ov.body.cv.averageBestMatch.average, 60);
  assert.equal(ov.body.cv.averageBestMatch.n, 5);
  assert.equal(ov.body.cv.excludedAiUnavailableResults, 6);
  const rows = byName((await get('/api/lecturer/students', lecA)).body.students);
  assert.equal(rows.Ann.latestCvMatch, 60);
  assert.equal(rows.Flo.latestCvMatch, null);
  assert.equal(rows.Flo.cvAnalyses, 1);
  const prof = await get(`/api/lecturer/students/${studentsA[0]._id}`, lecA);
  const results = prof.body.cvAnalyses[0].results;
  assert.deepEqual(results.map((r) => [r.matchPercentage, r.countsTowardAverage]), [[95, false], [60, true]]);
  assert.equal(prof.body.cvAnalyses[0].bestMatch, 60);
});

test('a CV re-analysed in place counts by updatedAt, and non-tech job results never count', async () => {
  // Older document re-analysed yesterday (the controller updates in place), newer document first made 5 days ago.
  db.addCv(studentsA[0], [db.result(80)], { daysAgo: 40, updatedAt: new Date(Date.now() - 86400000) });
  db.addCv(studentsA[0], [db.result(30)], { daysAgo: 5 });
  db.addCv(studentsA[1], [{ ...db.result(0), isNonTechRole: true }, db.result(55)]);
  db.addCv(studentsA[2], [{ ...db.result(0), isNonTechRole: true }]);
  const rows = byName((await get('/api/lecturer/students', lecA)).body.students);
  assert.equal(rows.Ann.latestCvMatch, 80, 'the most recently run analysis wins');
  assert.equal(rows.Bob.latestCvMatch, 55);
  assert.equal(rows.Cy.latestCvMatch, null);
  assert.equal(rows.Cy.needsAttention.some((r) => r.code === 'low_cv_match'), false);
  const prof = await get(`/api/lecturer/students/${studentsA[0]._id}`, lecA);
  assert.equal(prof.body.cvAnalyses[0].bestMatch, 80);
  assert.ok(prof.body.cvAnalyses[0].firstAnalysedAt < prof.body.cvAnalyses[0].date);
  const bob = await get(`/api/lecturer/students/${studentsA[1]._id}`, lecA);
  assert.deepEqual(bob.body.cvAnalyses[0].results.map((r) => [r.isNonTechRole, r.countsTowardAverage]), [[true, false], [false, true]]);
});

test('top missing skills come from each student latest CV analysis only', async () => {
  db.addCv(studentsA[0], [db.result(70, { missing: ['docker', 'sql'] })], { daysAgo: 10 });
  db.addCv(studentsA[0], [db.result(70, { missing: ['sql'] }), db.result(60, { missing: ['SQL', 'git'] })], { daysAgo: 1 });
  db.addCv(studentsA[1], [db.result(70, { missing: ['git'] })]);
  db.addCv(studentsA[2], [db.result(70, { missing: ['git', 'rest'], aiAvailable: false })]);
  db.addCv(studentsA[3], [db.result(80, { missing: [] })]);
  db.addCv(studentsA[4], [db.result(75, { missing: ['docker'] })]);
  const ov = await get('/api/lecturer/overview', lecA);
  assert.deepEqual(ov.body.cv.topMissingSkills, [{ skill: 'git', students: 3 }, { skill: 'docker', students: 1 }, { skill: 'rest', students: 1 }, { skill: 'sql', students: 1 }]);
  assert.equal(ov.body.cv.studentsWithAnalysis, 5);
  assert.equal(ov.body.cv.topMissingSkillsInsufficientData, false);
});

// Same 5-student rule as every other aggregate: with fewer contributing students the chips would point at individuals.
test('top missing skills are held back when fewer than 5 students have a CV analysis', async () => {
  for (const s of studentsA.slice(0, 4)) db.addCv(s, [db.result(70, { missing: ['docker'] })]);
  const ov = await get('/api/lecturer/overview', lecA);
  assert.deepEqual(ov.body.cv.topMissingSkills, []);
  assert.equal(ov.body.cv.topMissingSkillsInsufficientData, true);
  assert.equal(ov.body.cv.studentsWithAnalysis, 4);
  const g = await get('/api/lecturer/overview', lecA, { group: 'Group 1' });
  assert.deepEqual(g.body.cv.topMissingSkills, [], 'also inside a small group');
});

test('averages need at least 5 students; fewer gives null with a notice', async () => {
  for (const s of studentsA.slice(0, 4)) { db.addInterview(s); db.addCv(s, [db.result(70)]); }
  const ov = await get('/api/lecturer/overview', lecA);
  assert.equal(ov.body.interview.insufficientData, true);
  assert.equal(ov.body.interview.overall.average, null);
  assert.equal(ov.body.interview.overall.n, 4);
  assert.match(ov.body.interview.notice, /At least 5/);
  assert.equal(ov.body.cv.averageBestMatch.average, null);
  assert.equal(ov.body.totals.withMockInterview, 4);
  assert.equal(ov.body.totals.withCvAnalysis, 4);
});

// ---------------------------------------------------------------- needs attention
test('needs-attention reasons are machine-readable and match the rules', async () => {
  const [ann, bob, cy, di] = studentsA;
  db.addInterview(ann, { responses: [db.answer('behavioral', 40)] });
  db.addCv(ann, [db.result(30)]);
  db.addInterview(bob, { responses: [db.answer('behavioral', 40)], daysAgo: 5 });
  db.addInterview(bob, { responses: [db.answer('behavioral', 90)], daysAgo: 1 }); // latest is fine
  db.addCv(bob, [db.result(80)]);
  db.addCv(cy, [db.result(75)]);
  Object.assign(di, { lastActive: new Date(Date.now() - 40 * 86400000) });
  db.addInterview(di, { responses: [db.answer('behavioral', 75)], daysAgo: 45 });
  db.addCv(di, [db.result(75)], { daysAgo: 45 });
  const rows = byName((await get('/api/lecturer/students', lecA)).body.students);
  const codes = (n) => rows[n].needsAttention.map((r) => r.code);
  assert.deepEqual(codes('Ann'), ['low_interview_score', 'low_cv_match']);
  assert.deepEqual(codes('Bob'), []);
  assert.deepEqual(codes('Cy'), ['no_interview']);
  assert.deepEqual(codes('Di'), ['inactive_30_days']);
  assert.deepEqual(codes('Ed'), ['no_interview', 'no_cv']);
  assert.equal(rows.Ann.needsAttention[0].value, 40);
  assert.equal(rows.Di.needsAttention[0].days, 40);
  assert.ok(rows.Ann.needsAttention.every((r) => typeof r.message === 'string' && r.message));
  const only = await get('/api/lecturer/students', lecA, { attention: 'no_cv' });
  assert.deepEqual(only.body.students.map((s) => s.name), ['Ed', 'Flo']);
  const flagged = await get('/api/lecturer/students', lecA, { needsAttention: '1' });
  assert.deepEqual(flagged.body.students.map((s) => s.name), ['Ann', 'Cy', 'Di', 'Ed', 'Flo']);
  assert.equal((await get('/api/lecturer/students', lecA, { attention: 'nope' })).status, 400);
  assert.equal((await get('/api/lecturer/overview', lecA)).body.totals.needingAttention, 5);
});

// ---------------------------------------------------------------- group, search, sort, page
test('group filter applies to overview, table and CSV; the overview lists the groups', async () => {
  for (const s of studentsA) db.addInterview(s);
  const g1 = await get('/api/lecturer/overview', lecA, { group: 'Group 1' });
  assert.equal(g1.body.totals.students, 3);
  assert.equal(g1.body.group, 'Group 1');
  assert.deepEqual(g1.body.groups, ['Group 1', 'Group 2']);
  const t = await get('/api/lecturer/students', lecA, { group: 'Group 2' });
  assert.deepEqual(t.body.students.map((s) => s.name), ['Di', 'Ed', 'Flo']);
  assert.ok(t.body.students.every((s) => s.group === 'Group 2'));
  const csv = await get('/api/lecturer/students.csv', lecA, { group: 'Group 1' });
  assert.equal(csv.text.trim().split('\r\n').length, 4);
  assert.equal((await get('/api/lecturer/students', lecA, { group: 'nobody' })).body.total, 0);
  assert.equal((await get('/api/lecturer/overview', lecA, { group: 'x'.repeat(61) })).status, 400);
});

test('search, sort (nulls last, ties by name) and pagination', async () => {
  db.addInterview(studentsA[2], { responses: [db.answer('behavioral', 90)] });
  db.addInterview(studentsA[0], { responses: [db.answer('behavioral', 60)] });
  db.addInterview(studentsA[4], { responses: [db.answer('behavioral', 60)] });
  const desc = await get('/api/lecturer/students', lecA, { sort: '-avgInterviewScore' });
  assert.deepEqual(desc.body.students.map((s) => s.name), ['Cy', 'Ann', 'Ed', 'Bob', 'Di', 'Flo']);
  const asc = await get('/api/lecturer/students', lecA, { sort: 'avgInterviewScore' });
  assert.deepEqual(asc.body.students.map((s) => s.name), ['Ann', 'Ed', 'Cy', 'Bob', 'Di', 'Flo']);
  assert.equal((await get('/api/lecturer/students', lecA, { sort: 'password' })).status, 400);
  const p2 = await get('/api/lecturer/students', lecA, { pageSize: 4, page: 2 });
  assert.deepEqual(p2.body.students.map((s) => s.name), ['Ed', 'Flo']);
  assert.deepEqual([p2.body.total, p2.body.totalPages, p2.body.page, p2.body.pageSize], [6, 2, 2, 4]);
  const s = await get('/api/lecturer/students', lecA, { search: 'FLO@' });
  assert.deepEqual(s.body.students.map((x) => x.name), ['Flo']);
  const row = s.body.students[0];
  assert.deepEqual(Object.keys(row).sort(), ['avgInterviewScore', 'cvAnalyses', 'email', 'group', 'id', 'interviewsCompleted', 'lastActive',
    'latestCvMatch', 'latestInterviewScore', 'name', 'needsAttention', 'practiceSolved'].sort());
});

test('practice solved counts distinct accepted questions with eligible scores', async () => {
  const q1 = newId(); const q2 = newId();
  db.addAttempt(studentsA[0], { questionId: q1, verdict: 'accepted', score: 100, scoreSource: 'tests' });
  db.addAttempt(studentsA[0], { questionId: q1, verdict: 'accepted', score: 100, scoreSource: 'tests' });
  db.addAttempt(studentsA[0], { questionId: q2, verdict: 'accepted', score: 100, scoreSource: 'fallback' });
  db.addAttempt(studentsA[0], { questionId: q2, verdict: 'accepted', score: 100, assessmentSessionId: newId() });
  const row = byName((await get('/api/lecturer/students', lecA)).body.students).Ann;
  assert.equal(row.practiceSolved, 1);
  const prof = await get(`/api/lecturer/students/${studentsA[0]._id}`, lecA);
  assert.equal(prof.body.practice.submissions, 3);
  assert.equal(prof.body.practice.excludedScores, 1);
});

// ---------------------------------------------------------------- delivery metrics
const dm = (o) => ({ cameraUsed: true, faceVisiblePct: 90, eyeContactPct: 60, lookAwayCount: 2, headMovement: 'low', wordsPerMinute: 130, fillerWordCount: 3, durationSec: 60, ...o });

test('delivery metrics: optional, cleaned, camera values only when the camera was used, 5-student minimum', async () => {
  // Four students with metrics: not enough.
  for (const s of studentsA.slice(0, 4)) db.addInterview(s, { responses: [db.answer('behavioral', 70, { deliveryMetrics: dm() })] });
  db.addInterview(studentsA[5]); // older interview without any metrics
  let ov = await get('/api/lecturer/overview', lecA);
  assert.equal(ov.body.delivery.insufficientData, true);
  assert.equal(ov.body.delivery.n, 4);
  assert.equal(ov.body.delivery.eyeContactPct.average, null);
  // Fifth student: camera off (its eye contact must be ignored), plus a garbage value.
  db.addInterview(studentsA[4], { responses: [db.answer('behavioral', 70, { deliveryMetrics: dm({ cameraUsed: false, eyeContactPct: 0, faceVisiblePct: 0, headMovement: 'high', wordsPerMinute: 'fast', fillerWordCount: 13 }) })] });
  ov = await get('/api/lecturer/overview', lecA);
  const d = ov.body.delivery;
  assert.equal(d.insufficientData, false);
  assert.equal(d.n, 5);
  assert.equal(d.cameraUsedPct.average, 80);
  assert.deepEqual(d.eyeContactPct, { average: null, n: 4 }, 'only 4 students had camera data');
  assert.deepEqual(d.fillerWordCount, { average: 5, n: 5 });
  assert.deepEqual(d.wordsPerMinute, { average: null, n: 4 });
  assert.equal(d.headMovement.lowPct, 100);
  const prof = await get(`/api/lecturer/students/${studentsA[4]._id}`, lecA);
  assert.equal(prof.body.delivery.cameraUsedPct, 0);
  assert.deepEqual(prof.body.delivery.eyeContactPct, { average: null, n: 0 });
  assert.deepEqual(prof.body.delivery.fillerWordCount, { average: 13, n: 1 });
  const none = await get(`/api/lecturer/students/${studentsA[5]._id}`, lecA);
  assert.deepEqual(none.body.delivery, { answers: 0, hasData: false });
});

test('cleanDelivery rejects out-of-range and wrongly typed values', () => {
  assert.equal(m.cleanDelivery(undefined), null);
  assert.deepEqual(m.cleanDelivery({ cameraUsed: true, faceVisiblePct: 140, eyeContactPct: -1, lookAwayCount: 2.5, headMovement: 'wild', wordsPerMinute: -3, fillerWordCount: '2', durationSec: 30 }), {
    cameraUsed: true, faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null, wordsPerMinute: null, fillerWordCount: null, durationSec: 30,
  });
  assert.equal(m.cleanDelivery({ cameraUsed: 'yes', eyeContactPct: 50 }).eyeContactPct, null);
});

// ---------------------------------------------------------------- detail views, audit, secrets
test('student profile and interview detail return answers, feedback source, execution results and delivery metrics', async () => {
  const code = db.answer('coding', 75, {
    code: 'function f(){}', language: 'javascript', executionResults: { success: true, verdict: 'accepted', serverVerified: true, testsPassed: 3, testsTotal: 3, output: 'ok' },
    deliveryMetrics: dm(),
  });
  const voice = db.answer('behavioral', 65, { textResponse: '', transcription: 'I led a team of four', feedback: { score: 65, source: 'fallback', communicationClarity: 6 } });
  const iv = db.addInterview(studentsA[0], { responses: [code, voice] });
  db.skills.push({ institutionId: IDS.instA, userId: studentsA[0]._id, createdAt: new Date(), skills: [{ name: 'SQL', category: 'Data', proficiencyLevel: 3 }, { name: 'JS', category: 'Code', proficiencyLevel: 8 }] });
  const prof = await get(`/api/lecturer/students/${studentsA[0]._id}`, lecA);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.student.email, 'ann@a.edu');
  assert.equal(prof.body.interviews[0].jobExcerpt.startsWith('Junior developer'), true);
  assert.deepEqual(prof.body.interviews[0].categoryScores, { behavioural: null, technical: null, coding: 75, communication: 70 });
  assert.equal(prof.body.skills.averageProficiency, 5.5);
  assert.equal(prof.body.skills.weakest[0].name, 'SQL');
  const det = await get(`/api/lecturer/students/${studentsA[0]._id}/interviews/${iv._id}`, lecA);
  assert.equal(det.status, 200);
  const [q1, q2] = det.body.interview.questions;
  assert.equal(q1.answer.code, 'function f(){}');
  assert.equal(q1.feedbackSource, 'ai');
  assert.equal(q1.executionResults.testsPassed, 3);
  assert.equal(q1.deliveryMetrics.eyeContactPct, 60);
  assert.equal(q2.answer.transcript, 'I led a team of four');
  assert.equal(q2.feedback.source, 'fallback');
  assert.equal(q2.deliveryMetrics, null);
  assert.equal(det.body.interview.score, 75);
  assert.equal(det.body.interview.storedOverallScore, 50);
  assert.equal(det.body.interview.excludedFallbackAnswers, 1);
});

test('every lecturer view of one student is audited; list views are not', async () => {
  const iv = db.addInterview(studentsA[0]);
  await get('/api/lecturer/overview', lecA);
  await get('/api/lecturer/students', lecA);
  assert.equal(w.audit.length, 0);
  await get(`/api/lecturer/students/${studentsA[0]._id}`, lecA);
  await get(`/api/lecturer/students/${studentsA[0]._id}/interviews/${iv._id}`, adminA);
  const views = w.audit.filter((a) => a.action === 'lecturer.view_student');
  assert.equal(views.length, 2);
  assert.deepEqual(views.map((v) => [v.actor, v.target, String(v.institutionId), v.meta.view]), [
    [String(lecA._id), String(studentsA[0]._id), IDS.instA, 'profile'],
    [String(adminA._id), String(studentsA[0]._id), IDS.instA, 'interview'],
  ]);
  assert.equal(views[1].meta.interviewId, String(iv._id));
});

test('CSV export: the table only, formula cells neutralised, audited', async () => {
  const evil = w.addUser({ name: '=HYPERLINK("http://x")', email: 'evil@a.edu', role: 'student', institutionId: IDS.instA, group: '+cmd', lastActive: new Date() });
  db.addInterview(evil, { responses: [db.answer('behavioral', 30)] });
  db.addCv(evil, [db.result(40)]);
  const res = await get('/api/lecturer/students.csv', lecA);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /students\.csv/);
  const lines = res.text.trim().split('\r\n');
  assert.equal(lines[0], 'name,email,group,last_active,interviews_completed,latest_interview_score,avg_interview_score,latest_cv_match,cv_analyses,practice_solved,needs_attention');
  assert.equal(lines.length, 8);
  assert.match(res.text, /"'=HYPERLINK\(""http:\/\/x""\)",evil@a\.edu,'\+cmd,/);
  assert.match(res.text, /low_interview_score;low_cv_match/);
  noSecrets(res.text, 'csv');
  const entry = w.audit.find((a) => a.action === 'lecturer.export_students');
  assert.ok(entry);
  assert.equal(entry.meta.rows, 7);
  assert.equal(String(entry.institutionId), IDS.instA);
  assert.equal((await get('/api/lecturer/students.csv', studentsA[0])).status, 403);
});

test('no lecturer response ever contains CV text, passwords, OTPs, invite tokens, hidden tests or audio URLs', async () => {
  const iv = db.addInterview(studentsA[0], { responses: [db.answer('coding', 70, { executionResults: { success: true, output: 'fine' } })] });
  db.addCv(studentsA[0], [db.result(70), db.result(50, { aiAvailable: false })]);
  db.skills.push({ institutionId: IDS.instA, userId: studentsA[0]._id, createdAt: new Date(), resumeHash: 'SECRET-HASH', skills: [{ name: 'SQL', proficiencyLevel: 3 }] });
  db.addAttempt(studentsA[0], { questionId: newId(), verdict: 'accepted', score: 100, scoreSource: 'tests' });
  for (const p of ['/api/lecturer/overview', '/api/lecturer/students', '/api/lecturer/students.csv',
    `/api/lecturer/students/${studentsA[0]._id}`, `/api/lecturer/students/${studentsA[0]._id}/interviews/${iv._id}`]) {
    const res = await get(p, lecA);
    assert.equal(res.status, 200, p);
    noSecrets(res.text, p);
    assert.equal(/resumeText|currentCV|password|inviteToken|Otp|audioUrl/.test(res.text), false, `${p} exposes a sensitive field name`);
  }
});

// ---------------------------------------------------------------- pure functions
test('interviewScores maps question types to categories and ignores skipped and fallback answers', () => {
  const s = m.interviewScores({ responses: [
    { questionType: 'behavioral', feedback: { score: 60, source: 'ai', communicationClarity: 8 } },
    { questionType: 'system_design', feedback: { score: 70, source: 'ai' } },
    { questionType: 'problem-solving', feedback: { score: 90, source: 'tests' } },
    { questionType: 'coding', feedback: { score: 100, source: 'fallback' } },
    { questionType: 'coding', skipped: true, feedback: { score: 0 } },
  ] });
  assert.deepEqual(s, { score: 73.3, categoryScores: { behavioural: 60, technical: 80, coding: null, communication: 80 }, answered: 3, excludedFallbackAnswers: 1, skipped: 1 });
});

test('parseSort only accepts whitelisted keys', () => {
  assert.deepEqual(m.parseSort(undefined), { key: 'name', desc: false });
  assert.deepEqual(m.parseSort('-lastActive'), { key: 'lastActive', desc: true });
  assert.equal(m.parseSort('email'), null);
  assert.equal(m.parseSort('__proto__'), null);
});
