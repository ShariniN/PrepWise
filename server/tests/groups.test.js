// Optional student group ('CS 2026'): set by invite, CSV import and PATCH; max 60 characters; tenant-scoped.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { makeWorld, IDS, userModel } from './helpers.js';
import { parseUsersCsv } from '../services/csv.js';
import app from '../app.js';

let w, adminA, adminB, stuA, stuB, lecA;
const as = (u) => ({ Cookie: w.cookie(u) });

beforeEach(() => {
  w = makeWorld();
  w.institutions[IDS.instA].contractedStudentLimit = 50;
  w.install();
  adminA = w.addUser({ name: 'Admin A', email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  adminB = w.addUser({ name: 'Admin B', email: 'admin@b.edu', role: 'university_admin', institutionId: IDS.instB });
  lecA = w.addUser({ name: 'Lec', email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA });
  stuA = w.addUser({ name: 'Stu A', email: 'stu@a.edu', role: 'student', institutionId: IDS.instA, group: 'CS 2026' });
  stuB = w.addUser({ name: 'Stu B', email: 'stu@b.edu', role: 'student', institutionId: IDS.instB });
});
afterEach(() => mock.restoreAll());

test('invite stores a trimmed group and rejects one over 60 characters', async () => {
  const ok = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'g@a.edu', name: 'G', group: '  CS   2027 ' });
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.body.user.group, 'CS 2027');
  assert.equal(w.users.find((u) => u.email === 'g@a.edu').group, 'CS 2027');
  const long = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'h@a.edu', group: 'x'.repeat(61) });
  assert.equal(long.status, 400);
  assert.equal(long.body.code, 'INVALID_GROUP');
  assert.equal(w.users.some((u) => u.email === 'h@a.edu'), false);
  const bad = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'i@a.edu', group: 42 });
  assert.equal(bad.status, 400);
});

test('CSV import reads an optional group column; an over-long group fails only that row', async () => {
  assert.equal(parseUsersCsv('email\na@a.edu\n').rows[0].group, '');
  const res = await request(app).post('/api/institution/people/import').set(as(adminA)).set('Content-Type', 'text/csv')
    .send(`email,name,Group\nc1@a.edu,C1,CS 2026\nc2@a.edu,C2,${'y'.repeat(61)}\nc3@a.edu,C3,\n`);
  assert.equal(res.status, 200, res.text);
  const by = Object.fromEntries(res.body.results.map((r) => [r.email, r.status]));
  assert.deepEqual(by, { 'c1@a.edu': 'invited', 'c2@a.edu': 'error', 'c3@a.edu': 'invited' });
  assert.equal(w.users.find((u) => u.email === 'c1@a.edu').group, 'CS 2026');
  assert.equal(w.users.find((u) => u.email === 'c3@a.edu').group, '');
});

test('PATCH /people/:id/group sets and clears a group, is audited, and is tenant-scoped', async () => {
  const set = await request(app).patch(`/api/institution/people/${stuA._id}/group`).set(as(adminA)).send({ group: 'Group 2' });
  assert.equal(set.status, 200, set.text);
  assert.equal(set.body.user.group, 'Group 2');
  assert.deepEqual(w.audit.at(-1), { actor: String(adminA._id), action: 'user.group_change', target: String(stuA._id), institutionId: IDS.instA, meta: { from: 'CS 2026', to: 'Group 2' } });
  const clear = await request(app).patch(`/api/institution/people/${stuA._id}/group`).set(as(adminA)).send({ group: '' });
  assert.equal(clear.body.user.group, '');
  assert.equal((await request(app).patch(`/api/institution/people/${stuA._id}/group`).set(as(adminA)).send({})).status, 400);
  assert.equal((await request(app).patch(`/api/institution/people/${stuA._id}/group`).set(as(adminA)).send({ group: 'z'.repeat(61) })).status, 400);
  assert.equal((await request(app).patch(`/api/institution/people/${stuB._id}/group`).set(as(adminA)).send({ group: 'x' })).status, 404);
  assert.equal((await request(app).patch(`/api/institution/people/${stuA._id}/group`).set(as(lecA)).send({ group: 'x' })).status, 403);
  assert.equal((await request(app).patch(`/api/institution/people/${stuA._id}/group`).set(as(adminB)).send({ group: 'x' })).status, 404);
});

test('people list shows the group and filters by it', async () => {
  w.addUser({ name: 'Other', email: 'o@a.edu', role: 'student', institutionId: IDS.instA, group: 'Group 9' });
  const res = await request(app).get('/api/institution/people').query({ group: 'CS 2026' }).set(as(adminA));
  assert.deepEqual(res.body.people.map((p) => [p.email, p.group]), [['stu@a.edu', 'CS 2026']]);
  const all = await request(app).get('/api/institution/people').set(as(adminA));
  assert.equal(all.body.people.find((p) => p.email === 'lec@a.edu').group, '');
});

test('the user model limits group to 60 characters', async () => {
  const base = { name: 'N', email: 'n@a.edu', password: 'x'.repeat(20), role: 'student', institutionId: new mongoose.Types.ObjectId() };
  await new userModel({ ...base, group: 'g'.repeat(60) }).validate();
  await assert.rejects(() => new userModel({ ...base, group: 'g'.repeat(61) }).validate(), /Group cannot exceed 60/);
});
