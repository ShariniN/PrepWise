// Manage-people API: tenant isolation, role checks, student limit, allowed domains, CSV import.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import app from '../app.js';

let w;
let adminA, adminB, studentA, lecturerA, studentB;

beforeEach(() => {
  w = makeWorld();
  w.install();
  adminA = w.addUser({ name: 'Admin A', email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  adminB = w.addUser({ name: 'Admin B', email: 'admin@b.edu', role: 'university_admin', institutionId: IDS.instB });
  studentA = w.addUser({ name: 'Stu A', email: 'stu@a.edu', role: 'student', institutionId: IDS.instA });
  lecturerA = w.addUser({ name: 'Lec A', email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA });
  studentB = w.addUser({ name: 'Stu B', email: 'stu@b.edu', role: 'student', institutionId: IDS.instB });
});
afterEach(() => mock.restoreAll());

const as = (user) => ({ Cookie: w.cookie(user) });

test('unauthenticated requests to /api/institution get 401', async () => {
  for (const [m, url] of [['get', '/api/institution/people'], ['get', '/api/institution/usage'], ['post', '/api/institution/people/invite']]) {
    assert.equal((await request(app)[m](url)).status, 401, url);
  }
});

test('students and lecturers cannot call /api/institution/*', async () => {
  for (const user of [studentA, lecturerA]) {
    for (const [m, url] of [
      ['get', '/api/institution/people'], ['get', '/api/institution/usage'], ['post', '/api/institution/people/invite'],
      ['post', '/api/institution/people/import'], ['patch', `/api/institution/people/${studentB._id}/deactivate`],
    ]) {
      assert.equal((await request(app)[m](url).set(as(user))).status, 403, `${user.role} ${m} ${url}`);
    }
  }
});

test('a user with no role is denied (default deny)', async () => {
  const odd = w.addUser({ email: 'odd@a.edu', role: undefined, institutionId: IDS.instA });
  assert.equal((await request(app).get('/api/institution/people').set(as(odd))).status, 403);
});

test('admin of A lists only people of A, with counts', async () => {
  const res = await request(app).get('/api/institution/people').set(as(adminA));
  assert.equal(res.status, 200);
  const emails = res.body.people.map((p) => p.email).sort();
  assert.deepEqual(emails, ['admin@a.edu', 'lec@a.edu', 'stu@a.edu']);
  assert.equal(res.body.counts.total, 3);
  assert.equal(res.body.counts.byRole.student, 1);
  assert.equal(res.body.usage.activeStudents, 1);
  assert.equal(JSON.stringify(res.body).includes('stu@b.edu'), false);
});

test('people list filters by role, status and search', async () => {
  const byRole = await request(app).get('/api/institution/people?role=lecturer').set(as(adminA));
  assert.deepEqual(byRole.body.people.map((p) => p.email), ['lec@a.edu']);
  const bySearch = await request(app).get('/api/institution/people?search=stu').set(as(adminA));
  assert.deepEqual(bySearch.body.people.map((p) => p.email), ['stu@a.edu']);
  const bad = await request(app).get('/api/institution/people?role=hacker').set(as(adminA));
  assert.equal(bad.status, 400);
});

test('people list never exposes password hashes or invite token hashes', async () => {
  w.addUser({ email: 'inv@a.edu', institutionId: IDS.instA, status: 'invited', inviteTokenHash: 'deadbeef' });
  const res = await request(app).get('/api/institution/people').set(as(adminA));
  const text = JSON.stringify(res.body);
  assert.equal(text.includes('deadbeef'), false);
  assert.equal(text.includes('hashed'), false);
});

test('admin of A cannot deactivate, reactivate, resend or re-role a person of B', async () => {
  for (const [method, path] of [['patch', 'deactivate'], ['patch', 'reactivate'], ['post', 'resend-invite']]) {
    const res = await request(app)[method](`/api/institution/people/${studentB._id}/${path}`).set(as(adminA));
    assert.equal(res.status, 404, path);
  }
  const role = await request(app).patch(`/api/institution/people/${studentB._id}/role`).set(as(adminA)).send({ role: 'lecturer' });
  assert.equal(role.status, 404);
  assert.equal(studentB.status, 'active');
  assert.equal(studentB.role, 'student');
});

test('invite creates the user in the admin\'s own institution, ignoring any institution in the body', async () => {
  const res = await request(app).post('/api/institution/people/invite').set(as(adminA))
    .send({ email: 'new@a.edu', name: 'New', role: 'lecturer', institutionId: IDS.instB });
  assert.equal(res.status, 201, res.text);
  const created = w.users.find((u) => u.email === 'new@a.edu');
  assert.equal(created.institutionId, IDS.instA);
  assert.equal(created.status, 'invited');
  assert.equal(w.audit.at(-1).action, 'user.invite');
  assert.equal(w.mails.length, 1);
});

test('invite stores only a SHA-256 hash and returns the link outside production', async () => {
  const res = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'x@a.edu', name: 'X' });
  const token = new URL(res.body.inviteLink).searchParams.get('token');
  assert.match(token, /^[a-f0-9]{64}$/);
  const stored = w.users.find((u) => u.email === 'x@a.edu');
  assert.match(stored.inviteTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(stored.inviteTokenHash, token);
  const days = (new Date(stored.inviteExpiresAt) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days <= 7);
  assert.equal(w.mails[0].html.includes(token), true, 'the emailed link carries the raw token');
});

test('invite link is not returned in production', async () => {
  process.env.NODE_ENV = 'production';
  try {
    const res = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'p@a.edu', name: 'P' });
    assert.equal(res.status, 201);
    assert.equal(res.body.inviteLink, undefined);
  } finally {
    process.env.NODE_ENV = 'test';
  }
});

test('student invites are blocked at the limit with 409, staff are still free', async () => {
  // limit is 3; A already has 1 student
  for (const n of [1, 2]) {
    const ok = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: `s${n}@a.edu`, name: `S${n}` });
    assert.equal(ok.status, 201);
  }
  const blocked = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 's3@a.edu', name: 'S3' });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'STUDENT_LIMIT_REACHED');
  assert.match(blocked.body.message, /limit of 3/);
  assert.equal(w.users.some((u) => u.email === 's3@a.edu'), false);

  const staff = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'lec2@a.edu', name: 'L', role: 'lecturer' });
  assert.equal(staff.status, 201);
  const admin = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'adm2@a.edu', name: 'A', role: 'university_admin' });
  assert.equal(admin.status, 201);
});

test('invited and deactivated seats: invited counts, deactivated does not', async () => {
  w.institutions[IDS.instA].contractedStudentLimit = 2;
  await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'i1@a.edu', name: 'I' });
  const usage = await request(app).get('/api/institution/usage').set(as(adminA));
  assert.deepEqual({ ...usage.body, success: undefined }, { success: undefined, studentLimit: 2, activeStudents: 1, invitedStudents: 1, remaining: 0 });
  studentA.status = 'deactivated';
  const after = await request(app).get('/api/institution/usage').set(as(adminA));
  assert.equal(after.body.remaining, 1);
});

test('a warning is returned once 90 percent of seats are used', async () => {
  w.institutions[IDS.instA].contractedStudentLimit = 10;
  for (let i = 0; i < 7; i++) w.addUser({ email: `g${i}@a.edu`, role: 'student', institutionId: IDS.instA }); // 8 students
  const ninth = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'n9@a.edu', name: 'N' });
  assert.equal(ninth.status, 201);
  assert.match(ninth.body.warning || '', /9 of 10/);
});

test('allowed email domains are enforced for every role', async () => {
  w.institutions[IDS.instA].allowedEmailDomains = ['a.edu'];
  const bad = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'x@gmail.com', name: 'X' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'DOMAIN_NOT_ALLOWED');
  const badStaff = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'x@evil.com', name: 'X', role: 'lecturer' });
  assert.equal(badStaff.status, 400);
  const good = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'X@A.EDU', name: 'X' });
  assert.equal(good.status, 201);
});

test('inviting an email that exists elsewhere gives a neutral 409', async () => {
  const res = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'stu@b.edu', name: 'Dup' });
  assert.equal(res.status, 409);
  assert.equal(/University B|instB|bbbb/i.test(res.text), false);
});

test('invite rejects bad input', async () => {
  const noEmail = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ name: 'X' });
  assert.equal(noEmail.status, 400);
  const badRole = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'r@a.edu', role: 'root' });
  assert.equal(badRole.status, 400);
});

test('CSV import (text/csv) stops adding students at the limit and reports each row', async () => {
  // limit 3, one student already exists -> room for 2
  const csv = '﻿email,name,role\r\nc1@a.edu,"Lovelace, Ada",student\r\nc2@a.edu,Bob,\r\nc3@a.edu,Cy,student\r\nteacher@a.edu,Tea,lecturer\r\nc4@a.edu,Di,student\r\n';
  const res = await request(app).post('/api/institution/people/import').set(as(adminA)).set('Content-Type', 'text/csv').send(csv);
  assert.equal(res.status, 200, res.text);
  const status = Object.fromEntries(res.body.results.map((r) => [r.email, r.status]));
  assert.deepEqual(status, {
    'c1@a.edu': 'invited', 'c2@a.edu': 'invited', 'c3@a.edu': 'blocked_limit', 'teacher@a.edu': 'invited', 'c4@a.edu': 'blocked_limit',
  });
  assert.equal(res.body.limitReached, true);
  assert.equal(w.users.find((u) => u.email === 'c1@a.edu').name, 'Lovelace, Ada');
  assert.equal(w.users.filter((u) => u.institutionId === IDS.instA && u.role === 'student').length, 3);
  assert.equal(w.audit.some((a) => a.action === 'user.import'), true);
});

test('CSV import skips existing emails and duplicates, and flags bad rows', async () => {
  const csv = 'email,name\nstu@a.edu,Already\nnew@a.edu,New\nnew@a.edu,Again\nnot-an-email,Bad\n';
  const res = await request(app).post('/api/institution/people/import').set(as(adminA)).set('Content-Type', 'text/csv').send(csv);
  const by = Object.fromEntries(res.body.results.map((r) => [r.line, r.status]));
  assert.deepEqual(by, { 2: 'skipped', 3: 'invited', 4: 'skipped', 5: 'error' });
});

test('CSV import accepts {csv} JSON, requires an email column, and caps at 2000 rows', async () => {
  const json = await request(app).post('/api/institution/people/import').set(as(adminA)).send({ csv: 'email\nj@a.edu\n' });
  assert.equal(json.body.results[0].status, 'invited');
  const noCol = await request(app).post('/api/institution/people/import').set(as(adminA)).set('Content-Type', 'text/csv').send('name\nBob\n');
  assert.equal(noCol.status, 400);
  const lines = ['email,role'];
  for (let i = 0; i < 2001; i++) lines.push(`u${i}@a.edu,lecturer`);
  const big = await request(app).post('/api/institution/people/import').set(as(adminA)).set('Content-Type', 'text/csv').send(lines.join('\n'));
  assert.equal(big.status, 413);
  assert.equal(w.users.some((u) => u.email === 'u0@a.edu'), false, 'nothing is imported when over the row limit');
});

test('import into A cannot create users in B', async () => {
  await request(app).post('/api/institution/people/import').set(as(adminA)).send({ csv: 'email,role\nq@a.edu,lecturer\n' });
  assert.equal(w.users.find((u) => u.email === 'q@a.edu').institutionId, IDS.instA);
});

test('deactivate and reactivate work inside the institution and are audited', async () => {
  const off = await request(app).patch(`/api/institution/people/${studentA._id}/deactivate`).set(as(adminA));
  assert.equal(off.status, 200);
  assert.equal(studentA.status, 'deactivated');
  const on = await request(app).patch(`/api/institution/people/${studentA._id}/reactivate`).set(as(adminA));
  assert.equal(on.status, 200);
  assert.equal(studentA.status, 'active');
  assert.deepEqual(w.audit.map((a) => a.action), ['user.deactivate', 'user.reactivate']);
});

test('reactivating a student is blocked at the limit', async () => {
  studentA.status = 'deactivated';
  for (let i = 0; i < 3; i++) w.addUser({ email: `h${i}@a.edu`, role: 'student', institutionId: IDS.instA });
  const res = await request(app).patch(`/api/institution/people/${studentA._id}/reactivate`).set(as(adminA));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'STUDENT_LIMIT_REACHED');
  assert.equal(studentA.status, 'deactivated');
});

test('reactivating a lecturer is free even when students are at the limit', async () => {
  for (let i = 0; i < 2; i++) w.addUser({ email: `k${i}@a.edu`, role: 'student', institutionId: IDS.instA });
  lecturerA.status = 'deactivated';
  const res = await request(app).patch(`/api/institution/people/${lecturerA._id}/reactivate`).set(as(adminA));
  assert.equal(res.status, 200);
  assert.equal(lecturerA.status, 'active');
});

test('an admin cannot deactivate themselves but can deactivate another admin', async () => {
  const self = await request(app).patch(`/api/institution/people/${adminA._id}/deactivate`).set(as(adminA));
  assert.equal(self.status, 400);
  const second = w.addUser({ email: 'admin2@a.edu', role: 'university_admin', institutionId: IDS.instA });
  const ok = await request(app).patch(`/api/institution/people/${second._id}/deactivate`).set(as(adminA));
  assert.equal(ok.status, 200);
});

test('resend-invite issues a new hash for pending invitations only', async () => {
  const pending = w.addUser({ email: 'pend@a.edu', role: 'lecturer', institutionId: IDS.instA, status: 'invited', inviteTokenHash: 'old', inviteExpiresAt: new Date(0) });
  const res = await request(app).post(`/api/institution/people/${pending._id}/resend-invite`).set(as(adminA));
  assert.equal(res.status, 200);
  assert.notEqual(pending.inviteTokenHash, 'old');
  assert.ok(new Date(pending.inviteExpiresAt) > new Date());
  const active = await request(app).post(`/api/institution/people/${studentA._id}/resend-invite`).set(as(adminA));
  assert.equal(active.status, 409);
});

test('role change is audited, respects the limit, and cannot target yourself', async () => {
  const ok = await request(app).patch(`/api/institution/people/${lecturerA._id}/role`).set(as(adminA)).send({ role: 'university_admin' });
  assert.equal(ok.status, 200);
  assert.deepEqual(w.audit.at(-1).meta, { from: 'lecturer', to: 'university_admin' });
  const self = await request(app).patch(`/api/institution/people/${adminA._id}/role`).set(as(adminA)).send({ role: 'student' });
  assert.equal(self.status, 400);
  for (let i = 0; i < 2; i++) w.addUser({ email: `m${i}@a.edu`, role: 'student', institutionId: IDS.instA });
  const full = await request(app).patch(`/api/institution/people/${lecturerA._id}/role`).set(as(adminA)).send({ role: 'student' });
  assert.equal(full.status, 409);
});

test('a deactivated admin token stops working immediately', async () => {
  const cookie = w.cookie(adminA);
  adminA.status = 'deactivated';
  const res = await request(app).get('/api/institution/people').set('Cookie', cookie);
  assert.equal(res.status, 401);
});

test('role in the JWT is ignored; the database role decides', async () => {
  // A student whose token claims to be an admin
  const forged = `token=${(await import('jsonwebtoken')).default.sign({ id: studentA._id, role: 'university_admin', institutionId: IDS.instA }, process.env.JWT_SECRET)}`;
  const res = await request(app).get('/api/institution/people').set('Cookie', forged);
  assert.equal(res.status, 403);
});
