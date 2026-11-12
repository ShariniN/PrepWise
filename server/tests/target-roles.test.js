// Institution settings, target roles, the student's target role, and the CV scored against it.
// No database and no real AI: the institution repo is stubbed over the shared test world, the AI SDK is stubbed.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { makeWorld, IDS, newId } from './helpers.js';
import institutionRepo from '../modules/institution/institution.repo.js';
import { roleAsJobDescription } from '../services/targetRoles.js';
import app from '../app.js';

const same = (a, b) => String(a) === String(b);
let w, adminA, adminB, lecturerA, studentA, roleBackend, roleData, roleOther;

const stubInstitutionRepo = () => {
  const inst = (id) => w.institutions[String(id)] || null;
  mock.method(institutionRepo, 'getInstitution', async (id) => inst(id));
  mock.method(institutionRepo, 'updateSettings', async (id, patch) => Object.assign(inst(id), patch));
  mock.method(institutionRepo, 'addTargetRole', async (id, role) => {
    inst(id).targetRoles.push({ _id: newId(), ...role });
    return inst(id);
  });
  mock.method(institutionRepo, 'updateTargetRole', async (id, roleId, fields) => {
    const role = inst(id).targetRoles.find((r) => same(r._id, roleId));
    if (!role) return null;
    Object.assign(role, fields);
    return inst(id);
  });
  // Mirrors the real atomic delete: nothing happens for an unknown role or when it is the only one left.
  mock.method(institutionRepo, 'deleteTargetRole', async (id, roleId) => {
    const i = inst(id);
    if (i.targetRoles.length < 2 || !i.targetRoles.some((r) => same(r._id, roleId))) return null;
    i.targetRoles = i.targetRoles.filter((r) => !same(r._id, roleId));
    return i;
  });
  mock.method(institutionRepo, 'clearTargetRole', async (id, roleId) => {
    for (const u of w.users) if (same(u.institutionId, id) && same(u.targetRoleId, roleId)) u.targetRoleId = null;
  });
  mock.method(institutionRepo, 'setStudentTargetRole', async (id, userId, roleId) => {
    const u = w.users.find((x) => same(x._id, userId) && same(x.institutionId, id));
    if (u) u.targetRoleId = roleId;
  });
};

beforeEach(() => {
  w = makeWorld();
  w.install();
  roleBackend = { _id: newId(), title: 'Backend developer intern', description: 'Builds APIs and services with a team of engineers.', skills: ['Node.js', 'SQL'] };
  roleData = { _id: newId(), title: 'Data analyst intern', description: 'Cleans data and builds charts.', skills: ['SQL', 'Excel'] };
  roleOther = { _id: newId(), title: 'Other university role', description: 'Not yours.', skills: [] };
  w.institutions[IDS.instA].targetRoles = [roleBackend, roleData];
  w.institutions[IDS.instA].selfSignup = true;
  w.institutions[IDS.instA].allowedEmailDomains = ['a.edu'];
  w.institutions[IDS.instB].targetRoles = [roleOther];
  adminA = w.addUser({ name: 'Admin', email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  adminB = w.addUser({ name: 'Admin B', email: 'admin@b.edu', role: 'university_admin', institutionId: IDS.instB });
  lecturerA = w.addUser({ name: 'Lec', email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA });
  studentA = w.addUser({ name: 'Stu', email: 'stu@a.edu', role: 'student', institutionId: IDS.instA });
  stubInstitutionRepo();
  for (const k of ['error', 'log', 'warn']) mock.method(console, k, () => {});
});
afterEach(() => mock.restoreAll());

const as = (user) => ({ Cookie: w.cookie(user) });

test('admin reads settings', async () => {
  const res = await request(app).get('/api/institution/settings').set(as(adminA));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.allowedEmailDomains, ['a.edu']);
  assert.equal(res.body.selfSignup, true);
  assert.equal(res.body.contractedStudentLimit, 3);
  assert.deepEqual(res.body.targetRoles.map((r) => r.title), ['Backend developer intern', 'Data analyst intern']);
  assert.equal(res.body.targetRoles[0].id, roleBackend._id);
  assert.deepEqual(res.body.targetRoles[0].skills, ['Node.js', 'SQL']);
});

test('admin patches domains and self-signup', async () => {
  const res = await request(app).patch('/api/institution/settings').set(as(adminA)).send({ allowedEmailDomains: [' @B.edu ', 'b.edu', 'c.ac.uk'], selfSignup: false });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.allowedEmailDomains, ['b.edu', 'c.ac.uk']);
  assert.equal(res.body.selfSignup, false);
  assert.deepEqual(w.institutions[IDS.instA].allowedEmailDomains, ['b.edu', 'c.ac.uk']);
  const bad = await request(app).patch('/api/institution/settings').set(as(adminA)).send({ allowedEmailDomains: ['not a domain'] });
  assert.equal(bad.status, 400);
});

test('patching the seat limit is refused', async () => {
  const res = await request(app).patch('/api/institution/settings').set(as(adminA)).send({ contractedStudentLimit: 500, selfSignup: false });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'LIMIT_NOT_EDITABLE');
  assert.equal(w.institutions[IDS.instA].contractedStudentLimit, 3);
  assert.equal(w.institutions[IDS.instA].selfSignup, true, 'nothing else was changed either');
});

test('lecturer and student cannot read settings', async () => {
  for (const user of [lecturerA, studentA]) {
    for (const [m, url] of [['get', '/api/institution/settings'], ['patch', '/api/institution/settings'], ['post', '/api/institution/target-roles']]) {
      assert.equal((await request(app)[m](url).set(as(user))).status, 403, `${user.role} ${m} ${url}`);
    }
  }
  assert.equal((await request(app).get('/api/institution/settings')).status, 401);
});

test('admin adds and edits a target role, with checks on the input', async () => {
  const created = await request(app).post('/api/institution/target-roles').set(as(adminA))
    .send({ title: ' Cloud intern ', description: 'Runs services in the cloud.', skills: ['AWS', ' Docker ', 'AWS'] });
  assert.equal(created.status, 201);
  assert.equal(created.body.targetRole.title, 'Cloud intern');
  assert.deepEqual(created.body.targetRole.skills, ['AWS', 'Docker']);
  assert.equal(w.institutions[IDS.instA].targetRoles.length, 3);

  const edited = await request(app).patch(`/api/institution/target-roles/${roleData._id}`).set(as(adminA)).send({ title: 'Data intern', skills: ['Python'] });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.targetRole.title, 'Data intern');
  assert.equal(edited.body.targetRole.description, 'Cleans data and builds charts.', 'a field left out is kept');
  assert.deepEqual(edited.body.targetRoles.map((r) => r.title), ['Backend developer intern', 'Data intern', 'Cloud intern']);

  assert.equal((await request(app).post('/api/institution/target-roles').set(as(adminA)).send({ title: '  ' })).status, 400);
  assert.equal((await request(app).patch(`/api/institution/target-roles/${roleData._id}`).set(as(adminA)).send({ title: 'x'.repeat(81) })).status, 400);
  assert.equal((await request(app).patch(`/api/institution/target-roles/${roleOther._id}`).set(as(adminA)).send({ title: 'Hijack' })).status, 404);
  assert.equal(roleOther.title, 'Other university role');
});

test('cannot delete the last target role', async () => {
  const res = await request(app).delete(`/api/institution/target-roles/${roleOther._id}`).set(as(adminB));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'LAST_TARGET_ROLE');
  assert.equal(w.institutions[IDS.instB].targetRoles.length, 1);
});

test("deleting a role clears students' targetRoleId", async () => {
  studentA.targetRoleId = roleData._id;
  const other = w.addUser({ email: 'o@a.edu', role: 'student', institutionId: IDS.instA, targetRoleId: roleBackend._id });
  const res = await request(app).delete(`/api/institution/target-roles/${roleData._id}`).set(as(adminA));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.targetRoles.map((r) => r.title), ['Backend developer intern']);
  assert.equal(studentA.targetRoleId, null);
  assert.equal(other.targetRoleId, roleBackend._id, 'students on another role are untouched');
  assert.equal((await request(app).delete(`/api/institution/target-roles/${roleOther._id}`).set(as(adminA))).status, 404);
});

test('students and lecturers list the target roles of their own institution', async () => {
  for (const user of [studentA, lecturerA]) {
    const res = await request(app).get('/api/me/target-roles').set(as(user));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [
      { id: roleBackend._id, title: 'Backend developer intern', description: roleBackend.description },
      { id: roleData._id, title: 'Data analyst intern', description: roleData.description },
    ]);
  }
  assert.equal((await request(app).get('/api/me/target-roles')).status, 401);
});

test('student sets a target role from their institution only', async () => {
  const ok = await request(app).put('/api/me/target-role').set(as(studentA)).send({ targetRoleId: roleData._id });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.targetRoleId, roleData._id);
  assert.equal(ok.body.targetRoleTitle, 'Data analyst intern');
  assert.equal(studentA.targetRoleId, roleData._id);

  for (const targetRoleId of [roleOther._id, 'not-an-id', undefined, newId()]) {
    const bad = await request(app).put('/api/me/target-role').set(as(studentA)).send({ targetRoleId });
    assert.equal(bad.status, 400, String(targetRoleId));
    assert.equal(bad.body.code, 'TARGET_ROLE_INVALID');
  }
  assert.equal(studentA.targetRoleId, roleData._id, 'a refused change keeps the old role');
  assert.equal((await request(app).put('/api/me/target-role').set(as(lecturerA)).send({ targetRoleId: roleData._id })).status, 403);
});

test('isAuthenticated reports needsOnboarding for a student without a role', async () => {
  const res = await request(app).get('/api/auth/is-auth').set(as(studentA));
  assert.equal(res.body.user.needsOnboarding, true);
  assert.equal(res.body.user.targetRoleId, null);
  assert.equal(res.body.user.targetRoleTitle, null);

  studentA.targetRoleId = roleBackend._id;
  const withRole = await request(app).get('/api/auth/is-auth').set(as(studentA));
  assert.equal(withRole.body.user.needsOnboarding, false);
  assert.equal(withRole.body.user.targetRoleId, roleBackend._id);
  assert.equal(withRole.body.user.targetRoleTitle, 'Backend developer intern');

  for (const user of [lecturerA, adminA]) {
    const r = await request(app).get('/api/auth/is-auth').set(as(user));
    assert.equal(r.body.user.needsOnboarding, false, user.role);
  }
});

// ---------------------------------------------------------------- CV against the target role

const CV_TEXT = `Student CV. BSc Computer Science. Skills: Node.js, Express, SQL, Git. ${'Built a REST API project. '.repeat(5)}`;
const stubGemini = (prompts) => mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({
  generateContent: async (prompt) => {
    prompts.push(prompt);
    let text;
    if (prompt.includes('extract ONLY technical skills')) text = '[{"name":"Node.js","category":"Web Frameworks","confidenceLevel":7}]';
    else if (prompt.includes('Reply with ONLY the number')) text = '0.8';
    else text = '{"strengths":["Node.js projects"],"contentWeaknesses":[],"structureWeaknesses":[],"contentRecommendations":["add tests"],"structureRecommendations":[]}';
    return { response: { text: () => text } };
  },
}));
const analyze = (body) => request(app).post('/api/analyze/analyze-resume').set(as(studentA)).send({ useProfileCV: 'true', ...body });

test('analyze-resume without a target role is 409 TARGET_ROLE_REQUIRED', async () => {
  studentA.currentCV = { text: CV_TEXT, fileName: 'cv.pdf', hash: 'h' };
  const res = await analyze({ jobDescriptions: '[]' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'TARGET_ROLE_REQUIRED');
});

test('analyze-resume scores against roleAsJobDescription(role) first', async () => {
  studentA.targetRoleId = roleBackend._id;
  studentA.currentCV = { text: CV_TEXT, fileName: 'cv.pdf', hash: 'h' };
  delete process.env.GROQ_API_KEY;
  const prompts = [];
  stubGemini(prompts);
  const pasted = 'Frontend intern at a startup: React, CSS and a good eye for detail. You will build screens.';
  const res = await analyze({ jobDescriptions: JSON.stringify([pasted]) });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.analysis.length, 2);
  assert.equal(res.body.analysis[0].kind, 'target_role');
  assert.equal(res.body.analysis[0].targetRoleId, roleBackend._id);
  assert.equal(res.body.analysis[1].kind, 'job_description');
  assert.ok(res.body.analysis[0].matchPercentage > 0);
  assert.ok(res.body.analysis[0].scoreBreakdown, 'same scoreBreakdown shape');
  assert.ok(prompts.some((p) => p.includes(roleAsJobDescription(roleBackend))), 'the role text is what the AI scores against');
  assert.ok(prompts.some((p) => p.includes('Backend developer intern')));
});

test('analyze-resume with no pasted job description scores only the target role', async () => {
  studentA.targetRoleId = roleData._id;
  studentA.currentCV = { text: CV_TEXT, fileName: 'cv.pdf', hash: 'h' };
  delete process.env.GROQ_API_KEY;
  stubGemini([]);
  const res = await analyze({});
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body.analysis.map((r) => r.kind), ['target_role']);
});

test('analyze-resume says so honestly when the AI is unavailable', async () => {
  studentA.targetRoleId = roleData._id;
  studentA.currentCV = { text: CV_TEXT, fileName: 'cv.pdf', hash: 'h' };
  delete process.env.GROQ_API_KEY;
  mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({ generateContent: async () => { throw new Error('no key'); } }));
  const res = await analyze({});
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.analysis[0].kind, 'target_role');
  assert.equal(res.body.analysis[0].matchPercentage, 0);
  assert.equal(res.body.analysis[0].hasError, true);
  assert.equal(res.body.analysis[0].scoreBreakdown.aiAvailable, false);
});
