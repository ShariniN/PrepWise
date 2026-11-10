// The career_officer role was removed. Accounts that still carry it must get no access and must not crash anything.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { makeWorld, IDS, userModel } from './helpers.js';
import app from '../app.js';

let w, adminA, co;
const as = (u) => ({ Cookie: w.cookie(u) });

beforeEach(async () => {
  w = makeWorld();
  w.install();
  mock.method(console, 'error', () => {});
  adminA = w.addUser({ name: 'Admin', email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  co = w.addUser({ name: 'Cara', email: 'careers@a.edu', role: 'career_officer', institutionId: IDS.instA, password: await bcrypt.hash('Passw0rd!', 4) });
});
afterEach(() => mock.restoreAll());

test('login with a removed role is refused with 403 and no session cookie', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'careers@a.edu', password: 'Passw0rd!' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ROLE_NOT_SUPPORTED');
  assert.equal(res.headers['set-cookie'], undefined);
});

test('an existing token for a removed role gets 403 everywhere, including routes with no role gate', async () => {
  for (const [m, url] of [
    ['get', '/api/auth/is-auth'], ['get', '/api/interviews/history'], ['get', '/api/user/profile'], ['get', '/api/me/export'],
    ['get', '/api/grading/queue'], ['get', '/api/institution/people'], ['get', '/api/questions'], ['get', '/api/practice/questions'],
    ['get', '/api/lecturer/overview'], ['get', '/api/lecturer/students'], ['get', '/api/analytics/admin/overview'],
  ]) {
    const res = await request(app)[m](url).set(as(co));
    assert.equal(res.status, 403, `${m} ${url}`);
  }
});

test('career_officer can no longer be invited or assigned', async () => {
  const inv = await request(app).post('/api/institution/people/invite').set(as(adminA)).send({ email: 'new@a.edu', role: 'career_officer' });
  assert.equal(inv.status, 400);
  assert.equal(inv.body.code, 'INVALID_ROLE');
  const lec = w.addUser({ email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA });
  const re = await request(app).patch(`/api/institution/people/${lec._id}/role`).set(as(adminA)).send({ role: 'career_officer' });
  assert.equal(re.status, 400);
  const csv = await request(app).post('/api/institution/people/import').set(as(adminA)).set('Content-Type', 'text/csv')
    .send('email,role\nx@a.edu,career_officer\n');
  assert.equal(csv.body.results[0].status, 'error');
});

test('an admin can still re-role or deactivate a legacy career officer', async () => {
  const re = await request(app).patch(`/api/institution/people/${co._id}/role`).set(as(adminA)).send({ role: 'lecturer' });
  assert.equal(re.status, 200, re.text);
  assert.equal(co.role, 'lecturer');
  const other = w.addUser({ email: 'co2@a.edu', role: 'career_officer', institutionId: IDS.instA });
  const off = await request(app).patch(`/api/institution/people/${other._id}/deactivate`).set(as(adminA));
  assert.equal(off.status, 200, off.text);
  const list = await request(app).get('/api/institution/people').set(as(adminA));
  assert.equal(list.status, 200);
});

test('the user model accepts saving a legacy role untouched but rejects setting it', async () => {
  const id = new mongoose.Types.ObjectId();
  const legacy = userModel.hydrate({ _id: id, name: 'Cara', email: 'c@a.edu', password: 'x'.repeat(20), role: 'career_officer', institutionId: new mongoose.Types.ObjectId(), status: 'active' });
  legacy.status = 'deactivated';
  await legacy.validate(); // must not throw
  legacy.role = 'career_officer';
  legacy.markModified('role');
  await assert.rejects(() => legacy.validate(), /not a valid role/);
  legacy.role = 'lecturer';
  await legacy.validate();
  const fresh = new userModel({ name: 'N', email: 'n@a.edu', password: 'x'.repeat(20), role: 'career_officer', institutionId: new mongoose.Types.ObjectId() });
  await assert.rejects(() => fresh.validate(), /not a valid role/);
  const ok = new userModel({ name: 'N', email: 'n@a.edu', password: 'x'.repeat(20), role: 'student', institutionId: new mongoose.Types.ObjectId() });
  await ok.validate();
});
