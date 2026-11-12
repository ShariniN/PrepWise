// Dashboard API (/api/dashboard): one dashboard, scoped by role. Lecturers see the groups an admin assigned them;
// admins see the whole university plus seat usage. No database: repositories are in-memory fakes that return full documents.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installDashboardWorld } from './support/dashboardWorld.js';
import * as m from '../modules/dashboard/dashboard.metrics.js';
import { scopeFor } from '../modules/dashboard/dashboard.repo.js';
import fs from 'node:fs';
import app from '../app.js';

const DAY = 86400000;
const dashboardRepoSource = fs.readFileSync(new URL('../modules/dashboard/dashboard.repo.js', import.meta.url), 'utf8');
let w, db, lecA, lec1, lecNone, adminA, lecB, studentsA, stuB, roleId;
const as = (u) => ({ Cookie: w.cookie(u) });
const get = (path, user, query = {}) => request(app).get(path).query(query).set(as(user));
const SECRETS = ['SECRET', 'hashed-password', 'invite-hash-xyz', '112233'];
const noSecrets = (text, where) => { for (const s of SECRETS) assert.equal(String(text).includes(s), false, `${where} leaks ${s}`); };
const LIST_PATHS = ['/api/dashboard/overview', '/api/dashboard/students', '/api/dashboard/students.csv'];

beforeEach(() => {
  w = makeWorld();
  w.install();
  db = installDashboardWorld(w);
  mock.method(console, 'error', () => {});
  roleId = newId();
  w.institutions[IDS.instA].targetRoles = [{ _id: roleId, title: 'Software engineer intern', description: 'Build things', skills: ['git'] }];
  const secret = { password: 'hashed-password', inviteTokenHash: 'invite-hash-xyz', verifyOtp: '112233', resetOtp: '112233', currentCV: { text: 'SECRET-CV-PROFILE', fileName: 'cv.pdf' } };
  lecA = w.addUser({ name: 'Lec A', email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA, assignedGroups: ['Group 1', 'Group 2'] });
  lec1 = w.addUser({ name: 'Lec One', email: 'lec1@a.edu', role: 'lecturer', institutionId: IDS.instA, assignedGroups: ['Group 1'] });
  lecNone = w.addUser({ name: 'Lec None', email: 'lec0@a.edu', role: 'lecturer', institutionId: IDS.instA, assignedGroups: [] });
  adminA = w.addUser({ name: 'Admin A', email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecB = w.addUser({ name: 'Lec B', email: 'lec@b.edu', role: 'lecturer', institutionId: IDS.instB, assignedGroups: ['Group 1'] });
  studentsA = ['Ann', 'Bob', 'Cy', 'Di', 'Ed', 'Flo'].map((n, i) => w.addUser({
    name: n, email: `${n.toLowerCase()}@a.edu`, role: 'student', institutionId: IDS.instA, group: i < 3 ? 'Group 1' : 'Group 2', lastActive: new Date(), targetRoleId: roleId, ...secret,
  }));
  db.defaultRoleId = roleId;
  stuB = w.addUser({ name: 'Zed', email: 'z@b.edu', role: 'student', institutionId: IDS.instB, group: 'Group 1', lastActive: new Date(), ...secret });
});
afterEach(() => mock.restoreAll());

const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, r]));
const rowsFor = async (user, query = {}) => byName((await get('/api/dashboard/students', user, { pageSize: 100, ...query })).body.students);
const codes = (row) => row.attention.map((a) => a.code);

// ---------------------------------------------------------------- access
test('roles: anonymous 401, students and removed roles 403, lecturers and admins 200', async () => {
  const co = w.addUser({ email: 'co@a.edu', role: 'career_officer', institutionId: IDS.instA });
  const id = studentsA[0]._id;
  const iv = db.addInterview(studentsA[0]);
  for (const p of [...LIST_PATHS, `/api/dashboard/students/${id}`, `/api/dashboard/students/${id}/interviews/${iv._id}`]) {
    assert.equal((await request(app).get(p)).status, 401, p);
    assert.equal((await get(p, studentsA[1])).status, 403, p);
    assert.equal((await get(p, co)).status, 403, p);
    assert.equal((await get(p, lecA)).status, 200, p);
    assert.equal((await get(p, adminA)).status, 200, p);
  }
});

test('old /api/lecturer and /api/analytics paths are 404', async () => {
  const id = studentsA[0]._id;
  for (const p of ['/api/lecturer/overview', '/api/lecturer/students', '/api/lecturer/students.csv', `/api/lecturer/students/${id}`,
    '/api/analytics/admin/overview', '/api/analytics/admin/evidence']) {
    for (const user of [lecA, adminA]) {
      const res = await get(p, user);
      assert.equal(res.status, 404, `${user.role} ${p}`);
      assert.match(res.headers['content-type'], /application\/json/, p);
    }
  }
});

test('scopeFor: admins see every group, lecturers their assigned groups', () => {
  assert.deepEqual(scopeFor(adminA), { institutionId: IDS.instA, groups: null });
  assert.deepEqual(scopeFor(lec1), { institutionId: IDS.instA, groups: ['Group 1'] });
  assert.deepEqual(scopeFor(lecNone), { institutionId: IDS.instA, groups: [] });
  assert.deepEqual(scopeFor({ role: 'lecturer', institutionId: IDS.instA }), { institutionId: IDS.instA, groups: [] }, 'no field means no groups');
});

test('tenancy: B never sees A; another university, bad ids, non-students and inactive students are 404', async () => {
  db.addInterview(studentsA[0]);
  db.addInterview(stuB);
  const b = await get('/api/dashboard/students', lecB);
  assert.deepEqual(b.body.students.map((s) => s.name), ['Zed']);
  assert.equal((await get('/api/dashboard/overview', lecB)).body.students, 1);
  const a = await get('/api/dashboard/students', adminA);
  assert.equal(a.body.total, 6);
  assert.equal(JSON.stringify(a.body).includes('Zed'), false);
  assert.equal((await get(`/api/dashboard/students/${stuB._id}`, adminA)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${stuB._id}`, lecA)).status, 404, 'same group name, other university');
  assert.equal((await get(`/api/dashboard/students/${studentsA[0]._id}`, lecB)).status, 404);
  assert.equal((await get('/api/dashboard/students/not-an-id', lecA)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${newId()}`, lecA)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${adminA._id}`, adminA)).status, 404, 'staff are not students');
  const invited = w.addUser({ name: 'Inv', email: 'inv@a.edu', role: 'student', institutionId: IDS.instA, status: 'invited', group: 'Group 1' });
  const gone = w.addUser({ name: 'Gone', email: 'gone@a.edu', role: 'student', institutionId: IDS.instA, status: 'deactivated', group: 'Group 1' });
  assert.equal((await get(`/api/dashboard/students/${invited._id}`, adminA)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${gone._id}`, adminA)).status, 404);
  assert.equal((await get('/api/dashboard/students', adminA)).body.total, 6, 'invited and deactivated students are not listed');
  assert.equal(w.audit.filter((x) => x.action === 'lecturer.view_student').length, 0, 'failed lookups are not audited as views');
});

test('interview detail: must belong to that student and university', async () => {
  const ivAnn = db.addInterview(studentsA[0]);
  const ivB = db.addInterview(stuB);
  assert.equal((await get(`/api/dashboard/students/${studentsA[0]._id}/interviews/${ivAnn._id}`, lecA)).status, 200);
  assert.equal((await get(`/api/dashboard/students/${studentsA[1]._id}/interviews/${ivAnn._id}`, lecA)).status, 404, 'mismatched student');
  assert.equal((await get(`/api/dashboard/students/${stuB._id}/interviews/${ivB._id}`, lecA)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${studentsA[0]._id}/interviews/${ivB._id}`, lecA)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${studentsA[0]._id}/interviews/zzz`, lecA)).status, 404);
});

// ---------------------------------------------------------------- lecturer scope
test('lecturer sees only assigned groups', async () => {
  for (const s of studentsA) db.addInterview(s);
  const t = await get('/api/dashboard/students', lec1);
  assert.equal(t.status, 200);
  assert.deepEqual(t.body.students.map((s) => s.name), ['Ann', 'Bob', 'Cy']);
  assert.equal(t.body.noGroupsAssigned, false);
  const ov = await get('/api/dashboard/overview', lec1);
  assert.equal(ov.body.students, 3);
  assert.deepEqual(ov.body.groups, ['Group 1'], 'the group list is the lecturer\'s own groups, not every group');
  assert.equal(ov.body.noGroupsAssigned, false);
  const csv = await get('/api/dashboard/students.csv', lec1);
  assert.equal(csv.text.trim().split('\r\n').length, 4);
  assert.equal(csv.text.includes('di@a.edu'), false);
  const inGroup = await get('/api/dashboard/students', lec1, { group: 'Group 1' });
  assert.equal(inGroup.body.total, 3);
});

test('lecturer ?group outside scope is 403 GROUP_NOT_ASSIGNED', async () => {
  for (const p of LIST_PATHS) {
    for (const group of ['Group 2', 'nobody']) {
      const res = await get(p, lec1, { group });
      assert.equal(res.status, 403, `${p} ${group}`);
      assert.equal(res.body.code, 'GROUP_NOT_ASSIGNED');
    }
    assert.equal((await get(p, lec1, { group: '  Group   1 ' })).status, 200, 'the group is cleaned before the check');
  }
  assert.equal((await get('/api/dashboard/students', adminA, { group: 'nobody' })).body.total, 0, 'admins may filter by any group');
  assert.equal((await get('/api/dashboard/overview', lec1, { group: 'x'.repeat(61) })).status, 400);
});

test('lecturer student detail outside scope is 404', async () => {
  const di = studentsA[3];
  assert.equal((await get(`/api/dashboard/students/${di._id}`, lec1)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${studentsA[0]._id}`, lec1)).status, 200);
  assert.equal((await get(`/api/dashboard/students/${di._id}`, adminA)).status, 200);
  const views = w.audit.filter((x) => x.action === 'lecturer.view_student');
  assert.deepEqual(views.map((v) => String(v.actor)), [String(lec1._id), String(adminA._id)], 'the refused view is not audited');
});

test('lecturer interview detail outside scope is 404', async () => {
  const iv = db.addInterview(studentsA[3]);
  assert.equal((await get(`/api/dashboard/students/${studentsA[3]._id}/interviews/${iv._id}`, lec1)).status, 404);
  assert.equal((await get(`/api/dashboard/students/${studentsA[3]._id}/interviews/${iv._id}`, lecA)).status, 200);
  assert.equal((await get(`/api/dashboard/students/${studentsA[3]._id}/interviews/${iv._id}`, adminA)).status, 200);
});

test('lecturer with no groups gets noGroupsAssigned', async () => {
  for (const s of studentsA) { db.addInterview(s); db.addCv(s, [db.result(70)]); }
  const ov = await get('/api/dashboard/overview', lecNone);
  assert.equal(ov.status, 200);
  assert.equal(ov.body.noGroupsAssigned, true);
  assert.equal(ov.body.students, 0);
  assert.deepEqual(ov.body.groups, []);
  assert.equal(ov.body.avgInterviewScore, null);
  assert.equal('seats' in ov.body, false);
  const t = await get('/api/dashboard/students', lecNone);
  assert.equal(t.status, 200);
  assert.equal(t.body.noGroupsAssigned, true);
  assert.deepEqual(t.body.students, []);
  assert.equal(t.body.total, 0);
  const csv = await get('/api/dashboard/students.csv', lecNone);
  assert.equal(csv.status, 200);
  assert.equal(csv.text.trim().split('\r\n').length, 1, 'header only');
  assert.equal((await get(`/api/dashboard/students/${studentsA[0]._id}`, lecNone)).status, 404);
  const b = await get('/api/dashboard/students', lecNone, { group: 'Group 1' });
  assert.equal(b.status, 403);
  assert.equal(b.body.code, 'GROUP_NOT_ASSIGNED');
});

test('admin sees all groups and seats', async () => {
  w.addUser({ name: 'Inv', email: 'inv@a.edu', role: 'student', institutionId: IDS.instA, status: 'invited' });
  const ov = await get('/api/dashboard/overview', adminA);
  assert.equal(ov.status, 200);
  assert.equal(ov.body.students, 6);
  assert.deepEqual(ov.body.groups, ['Group 1', 'Group 2']);
  assert.equal(ov.body.noGroupsAssigned, false);
  assert.deepEqual(ov.body.seats, { used: 7, limit: 3, invited: 1 }, 'used counts active and invited students, like Manage people');
  assert.equal((await get('/api/dashboard/students', adminA)).body.total, 6);
  const g = await get('/api/dashboard/overview', adminA, { group: 'Group 2' });
  assert.equal(g.body.students, 3);
  assert.equal(g.body.group, 'Group 2');
  assert.deepEqual(g.body.seats, { used: 7, limit: 3, invited: 1 }, 'seats are for the whole university');
  assert.equal('seats' in (await get('/api/dashboard/overview', lecA)).body, false, 'lecturers get no seats');
});

// ---------------------------------------------------------------- attention flags
test('inactive_14_days at 14 days not 13', async () => {
  const [ann, bob, cy] = studentsA;
  ann.lastActive = new Date(Date.now() - 14 * DAY);
  bob.lastActive = new Date(Date.now() - 13 * DAY);
  cy.lastActive = null;
  for (const s of [ann, bob]) {
    db.addInterview(s, { daysAgo: 20 });
    db.addCv(s, [db.result(70)], { daysAgo: 20 });
  }
  const rows = await rowsFor(adminA);
  assert.deepEqual(codes(rows.Ann), ['inactive_14_days']);
  assert.deepEqual(rows.Ann.attention[0], { code: 'inactive_14_days', label: 'Inactive 14+ days' });
  assert.deepEqual(codes(rows.Bob), []);
  assert.ok(codes(rows.Cy).includes('inactive_14_days'), 'no recorded activity counts as inactive');
  const ov = await get('/api/dashboard/overview', adminA);
  assert.equal(ov.body.activeLast14Days, 4, 'Bob, Di, Ed and Flo');
  assert.equal(m.INACTIVE_DAYS, 14);
});

test('score_drop_15 at a 15-point drop, not 14', async () => {
  const [ann, bob, cy, di] = studentsA;
  db.addInterview(ann, { responses: [db.answer('behavioral', 80)], daysAgo: 5 });
  db.addInterview(ann, { responses: [db.answer('behavioral', 65)], daysAgo: 1 });
  db.addInterview(bob, { responses: [db.answer('behavioral', 80)], daysAgo: 5 });
  db.addInterview(bob, { responses: [db.answer('behavioral', 66)], daysAgo: 1 });
  // An earlier drop does not count once the latest interview recovers.
  db.addInterview(cy, { responses: [db.answer('behavioral', 90)], daysAgo: 9 });
  db.addInterview(cy, { responses: [db.answer('behavioral', 40)], daysAgo: 5 });
  db.addInterview(cy, { responses: [db.answer('behavioral', 45)], daysAgo: 1 });
  // Both scores must exist: a latest interview scored only by the fallback has no score. Unfinished ones do not count.
  db.addInterview(di, { responses: [db.answer('behavioral', 90)], daysAgo: 5 });
  db.addInterview(di, { responses: [db.answer('behavioral', 10, { feedback: { score: 10, source: 'fallback' } })], daysAgo: 1 });
  db.addInterview(di, { responses: [db.answer('behavioral', 10)], status: 'in_progress', daysAgo: 0 });
  const rows = await rowsFor(adminA);
  assert.ok(codes(rows.Ann).includes('score_drop_15'));
  assert.deepEqual(rows.Ann.attention.find((a) => a.code === 'score_drop_15'), { code: 'score_drop_15', label: 'Score dropped 15+ points' });
  assert.equal(codes(rows.Bob).includes('score_drop_15'), false);
  assert.equal(codes(rows.Cy).includes('score_drop_15'), false);
  assert.equal(codes(rows.Di).includes('score_drop_15'), false);
  assert.equal(rows.Di.lastInterviewScore, null);
  assert.equal(m.SCORE_DROP, 15);
});

test('no_cv and no_interview flags', async () => {
  const [ann, bob, cy] = studentsA;
  db.addInterview(ann);
  db.addCv(ann, [db.result(70)]);
  db.addInterview(bob);
  db.addCv(cy, [db.result(60, { kind: 'job_description' })]);
  db.addInterview(cy, { status: 'in_progress' });
  const rows = await rowsFor(adminA);
  assert.deepEqual(rows.Ann.attention, []);
  assert.deepEqual(rows.Bob.attention, [{ code: 'no_cv', label: 'No CV yet' }]);
  assert.deepEqual(rows.Cy.attention, [{ code: 'no_interview', label: 'No interview yet' }], 'a CV checked against a pasted job still counts as a CV; an unfinished interview does not count');
  assert.deepEqual(rows.Ed.attention, [{ code: 'no_cv', label: 'No CV yet' }, { code: 'no_interview', label: 'No interview yet' }]);
  assert.deepEqual(m.ATTENTION_CODES, ['no_cv', 'no_interview', 'inactive_14_days', 'score_drop_15']);
  const only = await get('/api/dashboard/students', adminA, { attention: 'no_cv' });
  assert.deepEqual(only.body.students.map((s) => s.name), ['Bob', 'Di', 'Ed', 'Flo']);
  const flagged = await get('/api/dashboard/students', adminA, { needsAttention: '1' });
  assert.deepEqual(flagged.body.students.map((s) => s.name), ['Bob', 'Cy', 'Di', 'Ed', 'Flo']);
  assert.equal((await get('/api/dashboard/students', adminA, { attention: 'low_cv_match' })).status, 400, 'old codes are gone');
  assert.equal((await get('/api/dashboard/overview', adminA)).body.needingAttention, 5);
});

// ---------------------------------------------------------------- CV score, skills, target role
test('cvScore uses the target_role result only', async () => {
  const [ann, bob, cy, di] = studentsA;
  db.addCv(ann, [db.result(60)], { daysAgo: 10 });
  db.addCv(ann, [db.result(90, { kind: 'job_description' }), db.result(95, { aiAvailable: false })], { daysAgo: 1 });
  db.addCv(bob, [db.result(88, { kind: 'job_description' })]);
  db.addCv(cy, [db.result(77, { kind: null })]);
  db.addCv(di, [db.result(40)], { daysAgo: 40, updatedAt: new Date(Date.now() - DAY) });
  db.addCv(di, [db.result(70)], { daysAgo: 5 });
  const rows = await rowsFor(adminA);
  assert.equal(rows.Ann.cvScore, 60, 'latest target-role result with an AI score');
  assert.equal(rows.Bob.cvScore, null, 'a pasted job description does not count');
  assert.equal(rows.Cy.cvScore, null, 'a result without a kind is a job-description result');
  assert.equal(rows.Di.cvScore, 40, 'an analysis re-run in place counts by updatedAt');
  assert.equal(rows.Ed.cvScore, null);
  const ov = await get('/api/dashboard/overview', adminA);
  assert.equal(ov.body.avgCvScore, 50);
  assert.equal(ov.body.studentsWithCvScore, 2);
  const prof = await get(`/api/dashboard/students/${ann._id}`, adminA);
  assert.equal(prof.body.summary.cvScore, 60);
  assert.equal(prof.body.cvAnalyses.length, 2, 'the student record still shows every analysis');
  assert.deepEqual(prof.body.cvAnalyses[0].results.map((r) => r.kind), ['job_description', 'target_role']);
});

test('topMissingSkills hidden below 5 students', async () => {
  const [ann, bob, cy, di, ed] = studentsA;
  db.addCv(ann, [db.result(70, { missing: ['docker', 'sql'] })], { daysAgo: 10 });
  db.addCv(ann, [db.result(70, { missing: ['sql', 'Git'] }), db.result(60, { kind: 'job_description', missing: ['kubernetes'] })], { daysAgo: 1 });
  db.addCv(bob, [db.result(70, { missing: ['git'] })]);
  db.addCv(cy, [db.result(70, { missing: ['git', 'rest'] })]);
  db.addCv(di, [db.result(80, { missing: [] }), db.result(50, { missing: ['docker'], aiAvailable: false })]);
  let ov = await get('/api/dashboard/overview', adminA);
  assert.equal(ov.body.studentsWithCvScore, 4);
  assert.equal(ov.body.topMissingSkills, null, 'held back below 5 students with a CV score');
  db.addCv(ed, [db.result(75, { missing: ['docker'] })]);
  ov = await get('/api/dashboard/overview', adminA);
  assert.deepEqual(ov.body.topMissingSkills, [{ skill: 'Git', students: 3 }, { skill: 'docker', students: 1 }, { skill: 'rest', students: 1 }, { skill: 'sql', students: 1 }]);
  assert.equal(m.MIN_GROUP, 5);
  const g = await get('/api/dashboard/overview', adminA, { group: 'Group 1' });
  assert.equal(g.body.topMissingSkills, null, 'also inside a small group');
});

test('rows show the target role title, or null when the role was deleted', async () => {
  studentsA[0].targetRoleId = roleId;
  studentsA[1].targetRoleId = newId();
  studentsA[2].targetRoleId = null;
  const rows = await rowsFor(adminA);
  assert.equal(rows.Ann.targetRoleTitle, 'Software engineer intern');
  assert.equal(rows.Bob.targetRoleTitle, null);
  assert.equal(rows.Cy.targetRoleTitle, null);
  const csv = await get('/api/dashboard/students.csv', adminA);
  assert.match(csv.text, /ann@a\.edu,Group 1,Software engineer intern,/);
  delete w.institutions[IDS.instA].targetRoles;
  assert.equal((await rowsFor(adminA)).Ann.targetRoleTitle, null, 'an institution without a role list is fine');
});

// ---------------------------------------------------------------- interview scores, levels, trend
test('fallback-scored answers are excluded from interview scores and counted', async () => {
  // Stored overall score says 50; the honest answers average 80. A fallback answer of 10 must not pull it down.
  for (const s of studentsA.slice(0, 5)) {
    db.addInterview(s, { responses: [db.answer('behavioral', 80), db.answer('technical', 10, { feedback: { score: 10, source: 'fallback', communicationClarity: 1 } }), db.answer('coding', 0, { skipped: true, feedback: { score: 0, source: 'ai' } })] });
  }
  const ov = await get('/api/dashboard/overview', adminA);
  assert.equal(ov.status, 200, ov.text);
  assert.equal(ov.body.avgInterviewScore, 80);
  assert.equal(ov.body.studentsWithInterviewScore, 5);
  assert.equal((await rowsFor(adminA)).Ann.lastInterviewScore, 80);
  const prof = await get(`/api/dashboard/students/${studentsA[0]._id}`, adminA);
  assert.equal(prof.body.interviews[0].score, 80);
  assert.equal(prof.body.interviews[0].excludedFallbackAnswers, 1);
  assert.equal(prof.body.interviews[0].readinessLevel, 'Nearly Ready');
});

test('trend is the last 3 scores oldest first; level reached comes from the latest interview', async () => {
  const [ann, bob, cy, di] = studentsA;
  [50, 60, 70, 80].forEach((s, i) => db.addInterview(ann, { responses: [db.answer('behavioral', s)], daysAgo: 10 - i, levelReached: i === 3 ? 'hard' : 'medium' }));
  db.addInterview(ann, { responses: [db.answer('behavioral', 99)], status: 'in_progress', daysAgo: 0, levelReached: 'easy' });
  db.addInterview(bob, { responses: [db.answer('behavioral', 55)] });
  db.addInterview(cy, { levelReached: 'hard' });
  db.addInterview(di, { levelReached: 'easy' });
  const rows = await rowsFor(adminA);
  assert.deepEqual(rows.Ann.trend, [60, 70, 80]);
  assert.equal(rows.Ann.lastInterviewScore, 80);
  assert.equal(rows.Ann.lastLevelReached, 'hard');
  assert.deepEqual(rows.Bob.trend, [55]);
  assert.equal(rows.Bob.lastLevelReached, null, 'interviews from before levels have none');
  assert.deepEqual(rows.Ed.trend, []);
  assert.equal(rows.Ed.lastInterviewScore, null);
  const ov = await get('/api/dashboard/overview', adminA);
  assert.deepEqual(ov.body.levelReachedCounts, { easy: 1, medium: 0, hard: 2 });
});

test('row shape, search, sort (nulls last, ties by name) and pagination', async () => {
  db.addInterview(studentsA[2], { responses: [db.answer('behavioral', 90)] });
  db.addInterview(studentsA[0], { responses: [db.answer('behavioral', 60)] });
  db.addInterview(studentsA[4], { responses: [db.answer('behavioral', 60)] });
  const desc = await get('/api/dashboard/students', adminA, { sort: '-lastInterviewScore' });
  assert.deepEqual(desc.body.students.map((s) => s.name), ['Cy', 'Ann', 'Ed', 'Bob', 'Di', 'Flo']);
  const asc = await get('/api/dashboard/students', adminA, { sort: 'lastInterviewScore' });
  assert.deepEqual(asc.body.students.map((s) => s.name), ['Ann', 'Ed', 'Cy', 'Bob', 'Di', 'Flo']);
  for (const key of ['cvScore', 'lastInterviewScore', 'lastActive']) assert.ok(m.SORT_KEYS.includes(key), key);
  for (const key of ['cvScore', '-lastActive', 'practiceSolved', 'name']) assert.equal((await get('/api/dashboard/students', adminA, { sort: key })).status, 200, key);
  assert.equal((await get('/api/dashboard/students', adminA, { sort: 'password' })).status, 400);
  assert.equal((await get('/api/dashboard/students', adminA, { sort: 'avgInterviewScore' })).status, 400, 'old sort keys are gone');
  const p2 = await get('/api/dashboard/students', adminA, { pageSize: 4, page: 2 });
  assert.deepEqual(p2.body.students.map((s) => s.name), ['Ed', 'Flo']);
  assert.deepEqual([p2.body.total, p2.body.totalPages, p2.body.page, p2.body.pageSize], [6, 2, 2, 4]);
  const s = await get('/api/dashboard/students', adminA, { search: 'FLO@' });
  assert.deepEqual(s.body.students.map((x) => x.name), ['Flo']);
  assert.deepEqual(Object.keys(s.body.students[0]).sort(), ['attention', 'cvScore', 'email', 'group', 'id', 'lastActive', 'lastInterviewScore',
    'lastLevelReached', 'name', 'practiceSolved', 'targetRoleTitle', 'trend'].sort());
});

test('practice solved counts distinct accepted questions with eligible scores', async () => {
  const q1 = newId(); const q2 = newId();
  db.addAttempt(studentsA[0], { questionId: q1, verdict: 'accepted', score: 100, scoreSource: 'tests' });
  db.addAttempt(studentsA[0], { questionId: q1, verdict: 'accepted', score: 100, scoreSource: 'tests' });
  db.addAttempt(studentsA[0], { questionId: q2, verdict: 'accepted', score: 100, scoreSource: 'fallback' });
  db.addAttempt(studentsA[0], { questionId: q2, verdict: 'accepted', score: 100, assessmentSessionId: newId() });
  db.addAttempt(studentsA[1], { questionId: q1, verdict: 'accepted', score: 100, scoreSource: 'tests' });
  assert.equal((await rowsFor(adminA)).Ann.practiceSolved, 1);
  assert.equal((await get('/api/dashboard/overview', adminA)).body.practiceSolved, 2);
  const prof = await get(`/api/dashboard/students/${studentsA[0]._id}`, adminA);
  assert.equal(prof.body.practice.submissions, 3);
  assert.equal(prof.body.practice.excludedScores, 1);
});

// ---------------------------------------------------------------- detail views, audit, secrets
const dm = (o) => ({ cameraUsed: true, faceVisiblePct: 90, eyeContactPct: 60, lookAwayCount: 2, headMovement: 'low', wordsPerMinute: 130, fillerWordCount: 3, durationSec: 60, ...o });

test('student delivery metrics: optional, cleaned, camera values only when the camera was used', async () => {
  db.addInterview(studentsA[4], { responses: [db.answer('behavioral', 70, { deliveryMetrics: dm({ cameraUsed: false, eyeContactPct: 0, faceVisiblePct: 0, headMovement: 'high', wordsPerMinute: 'fast', fillerWordCount: 13 }) })] });
  db.addInterview(studentsA[5]);
  const prof = await get(`/api/dashboard/students/${studentsA[4]._id}`, adminA);
  assert.equal(prof.body.delivery.cameraUsedPct, 0);
  assert.deepEqual(prof.body.delivery.eyeContactPct, { average: null, n: 0 });
  assert.deepEqual(prof.body.delivery.fillerWordCount, { average: 13, n: 1 });
  const none = await get(`/api/dashboard/students/${studentsA[5]._id}`, adminA);
  assert.deepEqual(none.body.delivery, { answers: 0, hasData: false });
});

test('cleanDelivery rejects out-of-range and wrongly typed values', () => {
  assert.equal(m.cleanDelivery(undefined), null);
  assert.deepEqual(m.cleanDelivery({ cameraUsed: true, faceVisiblePct: 140, eyeContactPct: -1, lookAwayCount: 2.5, headMovement: 'wild', wordsPerMinute: -3, fillerWordCount: '2', durationSec: 30 }), {
    cameraUsed: true, faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null, wordsPerMinute: null, fillerWordCount: null, durationSec: 30,
  });
  assert.equal(m.cleanDelivery({ cameraUsed: 'yes', eyeContactPct: 50 }).eyeContactPct, null);
});

test('student profile and interview detail return answers, levels, feedback source, execution results and delivery metrics', async () => {
  const code = db.answer('coding', 75, {
    code: 'function f(){}', language: 'javascript', executionResults: { success: true, verdict: 'accepted', serverVerified: true, testsPassed: 3, testsTotal: 3, output: 'ok' },
    deliveryMetrics: dm(),
  });
  const voice = db.answer('behavioral', 65, { textResponse: '', transcription: 'I led a team of four', feedback: { score: 65, source: 'fallback', communicationClarity: 6 } });
  const iv = db.addInterview(studentsA[0], { responses: [code, voice], levels: ['medium'], levelReached: 'hard' });
  const old = db.addInterview(studentsA[0], { daysAgo: 30 });
  const prof = await get(`/api/dashboard/students/${studentsA[0]._id}`, lecA);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.student.email, 'ann@a.edu');
  assert.equal(prof.body.interviews[0].jobExcerpt.startsWith('Junior developer'), true);
  assert.deepEqual(prof.body.interviews[0].categoryScores, { behavioural: null, technical: null, coding: 75, communication: 70 });
  assert.equal(prof.body.interviews[0].levelReached, 'hard');
  assert.equal(prof.body.interviews[1].levelReached, null);
  assert.equal(prof.body.summary.lastLevelReached, 'hard');
  assert.equal('skills' in prof.body, false);
  const det = await get(`/api/dashboard/students/${studentsA[0]._id}/interviews/${iv._id}`, lecA);
  assert.equal(det.status, 200);
  assert.equal(det.body.interview.levelReached, 'hard');
  const [q1, q2] = det.body.interview.questions;
  assert.equal(q1.level, 'medium');
  assert.equal(q2.level, null, 'questions from before levels have none');
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
  const oldDet = await get(`/api/dashboard/students/${studentsA[0]._id}/interviews/${old._id}`, lecA);
  assert.equal(oldDet.body.interview.levelReached, null);
});

test('every view of one student is audited; list views are not', async () => {
  const iv = db.addInterview(studentsA[0]);
  await get('/api/dashboard/overview', lecA);
  await get('/api/dashboard/students', lecA);
  assert.equal(w.audit.length, 0);
  await get(`/api/dashboard/students/${studentsA[0]._id}`, lecA);
  await get(`/api/dashboard/students/${studentsA[0]._id}/interviews/${iv._id}`, adminA);
  const views = w.audit.filter((a) => a.action === 'lecturer.view_student');
  assert.equal(views.length, 2);
  assert.deepEqual(views.map((v) => [String(v.actor), v.target, String(v.institutionId), v.meta.view]), [
    [String(lecA._id), String(studentsA[0]._id), IDS.instA, 'profile'],
    [String(adminA._id), String(studentsA[0]._id), IDS.instA, 'interview'],
  ]);
  assert.equal(views[1].meta.interviewId, String(iv._id));
});

test('CSV export: the table columns, formula cells neutralised, audited', async () => {
  const evil = w.addUser({ name: '=HYPERLINK("http://x")', email: 'evil@a.edu', role: 'student', institutionId: IDS.instA, group: '+cmd', lastActive: new Date() });
  db.addInterview(evil, { responses: [db.answer('behavioral', 30)], daysAgo: 5 });
  db.addInterview(evil, { responses: [db.answer('behavioral', 10)], levelReached: 'easy' });
  const res = await get('/api/dashboard/students.csv', adminA);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /students\.csv/);
  const lines = res.text.trim().split('\r\n');
  assert.equal(lines[0], 'id,name,email,group,target_role,cv_score,last_interview_score,last_level_reached,trend,practice_solved,last_active,attention');
  assert.equal(lines.length, 8);
  assert.match(res.text, /"'=HYPERLINK\(""http:\/\/x""\)",evil@a\.edu,'\+cmd,,,10,easy,30;10,0,/);
  assert.match(res.text, /no_cv;score_drop_15/);
  noSecrets(res.text, 'csv');
  const entry = w.audit.find((a) => a.action === 'lecturer.export_students');
  assert.ok(entry);
  assert.equal(entry.meta.rows, 7);
  assert.equal(String(entry.institutionId), IDS.instA);
  assert.equal((await get('/api/dashboard/students.csv', studentsA[0])).status, 403);
});

test('no dashboard response ever contains CV text, passwords, OTPs, invite tokens, hidden tests, the question pool or audio URLs', async () => {
  const iv = db.addInterview(studentsA[0], { responses: [db.answer('coding', 70, { executionResults: { success: true, output: 'fine' } })], pool: { technical: { easy: 'SECRET-POOL' } } });
  db.addCv(studentsA[0], [db.result(70), db.result(50, { aiAvailable: false })]);
  db.addAttempt(studentsA[0], { questionId: newId(), verdict: 'accepted', score: 100, scoreSource: 'tests' });
  for (const p of [...LIST_PATHS, `/api/dashboard/students/${studentsA[0]._id}`, `/api/dashboard/students/${studentsA[0]._id}/interviews/${iv._id}`]) {
    const res = await get(p, lecA);
    assert.equal(res.status, 200, p);
    noSecrets(res.text, p);
    assert.equal(/resumeText|currentCV|password|inviteToken|Otp|audioUrl|"pool"/.test(res.text), false, `${p} exposes a sensitive field name`);
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
  assert.deepEqual(m.parseSort('-cvScore'), { key: 'cvScore', desc: true });
  assert.equal(m.parseSort('email'), null);
  assert.equal(m.parseSort('__proto__'), null);
});

test('studentRow tolerates missing data: no levels, no CV kind, no target role, no institution', () => {
  const row = m.studentRow({ _id: newId(), name: 'S' }, { interviews: [{ _id: newId(), status: 'completed', completedAt: new Date(), responses: [] }], cvAnalyses: [{ _id: newId(), results: [{ matchPercentage: 50 }] }] }, new Date());
  assert.equal(row.targetRoleTitle, null);
  assert.equal(row.cvScore, null);
  assert.equal(row.lastInterviewScore, null);
  assert.equal(row.lastLevelReached, null);
  assert.deepEqual(row.trend, []);
  assert.deepEqual(codes(row), [], 'a CV of any kind and a completed interview; the interview counts as recent activity');
  const empty = m.studentRow({ _id: newId() }, {}, new Date());
  assert.deepEqual(codes(empty), ['no_cv', 'no_interview', 'inactive_14_days']);
});

test('isTargetRoleScore ignores isNonTechRole and error results', () => {
  const ok = { kind: 'target_role', matchPercentage: 64, scoreBreakdown: { aiAvailable: true } };
  assert.equal(m.isTargetRoleScore(ok), true);
  assert.equal(m.isTargetRoleScore({ ...ok, matchPercentage: 0, isNonTechRole: true }), false);
  assert.equal(m.isTargetRoleScore({ kind: 'target_role', matchPercentage: 0, hasError: true }), false);
  const row = m.studentRow({ _id: newId(), name: 'S' }, { cvAnalyses: [{ _id: newId(), updatedAt: new Date(), results: [{ ...ok, matchPercentage: 0, isNonTechRole: true }] }] }, new Date());
  assert.equal(row.cvScore, null);
});

test('a role change makes the old CV score stop counting until the student re-analyses', async () => {
  const [ann, bob] = studentsA;
  const newRole = newId();
  w.institutions[IDS.instA].targetRoles.push({ _id: newRole, title: 'Data analyst intern', description: 'Data', skills: ['SQL'] });
  db.addCv(ann, [db.result(80, { missing: ['docker'] })], { daysAgo: 2 });
  db.addCv(bob, [db.result(60)], { daysAgo: 2 });
  ann.targetRoleId = newRole;
  let rows = await rowsFor(adminA);
  assert.equal(rows.Ann.cvScore, null, 'scored against the old role');
  assert.equal(rows.Bob.cvScore, 60);
  let ov = await get('/api/dashboard/overview', adminA);
  assert.deepEqual([ov.body.avgCvScore, ov.body.studentsWithCvScore], [60, 1]);
  assert.equal((await get(`/api/dashboard/students/${ann._id}`, adminA)).body.summary.cvScore, null);
  // Re-analysed against the new role: that result counts, the older one for the old role still does not.
  db.addCv(ann, [db.result(45, { roleId: newRole, missing: ['SQL'] })], { daysAgo: 1 });
  db.addCv(ann, [db.result(99)], { daysAgo: 0, updatedAt: new Date(Date.now() - 3 * DAY) });
  rows = await rowsFor(adminA);
  assert.equal(rows.Ann.cvScore, 45);
  ov = await get('/api/dashboard/overview', adminA);
  assert.deepEqual([ov.body.avgCvScore, ov.body.studentsWithCvScore], [52.5, 2]);
});

test('a deleted role means no CV score, and no missing skills from it', async () => {
  for (const s of studentsA.slice(0, 5)) db.addCv(s, [db.result(70, { missing: ['git'] })]);
  let ov = await get('/api/dashboard/overview', adminA);
  assert.equal(ov.body.studentsWithCvScore, 5);
  assert.deepEqual(ov.body.topMissingSkills, [{ skill: 'git', students: 5 }]);
  // The role is removed from the institution; the students' targetRoleId still points at it.
  w.institutions[IDS.instA].targetRoles = [{ _id: newId(), title: 'Other role', description: 'x', skills: [] }];
  const rows = await rowsFor(adminA);
  assert.equal(rows.Ann.cvScore, null);
  ov = await get('/api/dashboard/overview', adminA);
  assert.deepEqual([ov.body.avgCvScore, ov.body.studentsWithCvScore, ov.body.topMissingSkills], [null, 0, null]);
});

test('a target-role result without a targetRoleId never counts', () => {
  const role = { _id: newId(), title: 'R', skills: [] };
  const row = m.studentRow({ _id: newId(), name: 'S', targetRoleId: role._id }, { cvAnalyses: [{ _id: newId(), updatedAt: new Date(), results: [{ kind: 'target_role', matchPercentage: 70, scoreBreakdown: { aiAvailable: true } }] }] }, new Date(), { targetRoles: [role] });
  assert.equal(row.cvScore, null);
});

test('the CV projection selects each result targetRoleId and no CV text', () => {
  const fields = String(dashboardRepoSource.match(/const CV_FIELDS = \[([\s\S]*?)\]/)[1]);
  assert.match(fields, /'results\.targetRoleId'/);
  assert.doesNotMatch(fields, /resumeText/);
});
