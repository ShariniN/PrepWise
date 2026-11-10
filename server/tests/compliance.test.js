// Export, deletion, consent, sub-processors.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import app from '../app.js';

let w, stu, other, adminA;
beforeEach(async () => {
  w = makeWorld();
  w.install();
  const hash = await bcrypt.hash('Passw0rd!', 4);
  stu = w.addUser({ name: 'Stu', email: 'stu@a.edu', institutionId: IDS.instA, password: hash, inviteTokenHash: 'secret-invite-hash', verifyOtp: '123456', resetOtp: '654321' });
  other = w.addUser({ name: 'Other', email: 'other@a.edu', institutionId: IDS.instA, password: hash });
  adminA = w.addUser({ email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA, password: hash });
  w.interviews.push({ userId: stu._id, jobDescription: 'mine' }, { userId: other._id, jobDescription: 'theirs' });
  w.consents.push({ userId: other._id, type: 'terms', version: '1' });
});
afterEach(() => mock.restoreAll());
const as = (u) => ({ Cookie: w.cookie(u) });

test('export requires login', async () => {
  assert.equal((await request(app).get('/api/me/export')).status, 401);
});

test('export returns only the caller\'s data and never secrets', async () => {
  const res = await request(app).get('/api/me/export').set(as(stu));
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.email, 'stu@a.edu');
  assert.deepEqual(res.body.interviews.map((i) => i.jobDescription), ['mine']);
  assert.equal(res.body.consents.length, 0);
  const text = JSON.stringify(res.body);
  for (const secret of ['secret-invite-hash', '123456', '654321', 'theirs', 'other@a.edu']) {
    assert.equal(text.includes(secret), false, `export leaks ${secret}`);
  }
  assert.equal('password' in res.body.profile, false);
  assert.equal(w.audit.at(-1).action, 'user.export');
});

test('export ignores any user id supplied by the client', async () => {
  const res = await request(app).get(`/api/me/export?userId=${other._id}&id=${other._id}`).set(as(stu));
  assert.equal(res.body.profile.email, 'stu@a.edu');
});

test('delete needs the correct password', async () => {
  assert.equal((await request(app).delete('/api/me').set(as(stu)).send({})).status, 400);
  assert.equal((await request(app).delete('/api/me').set(as(stu)).send({ password: 'wrong' })).status, 403);
  assert.equal(w.users.some((u) => u._id === stu._id), true);
});

test('delete removes the caller and their data only, and writes an audit entry', async () => {
  const res = await request(app).delete('/api/me').set(as(stu)).send({ password: 'Passw0rd!' });
  assert.equal(res.status, 200, res.text);
  assert.equal(w.users.some((u) => u._id === stu._id), false);
  assert.equal(w.users.some((u) => u._id === other._id), true);
  assert.deepEqual(w.interviews.map((i) => i.jobDescription), ['theirs']);
  assert.equal(w.consents.length, 1);
  const entry = w.audit.at(-1);
  assert.equal(entry.action, 'user.delete');
  assert.equal(entry.actor, stu._id);
  assert.equal(entry.institutionId, IDS.instA);
  assert.equal(JSON.stringify(entry).includes('stu@a.edu'), false, 'the audit entry holds ids, not personal data');
  assert.match(res.headers['set-cookie'][0], /^token=;/);
});

test('the only administrator cannot delete their account', async () => {
  const res = await request(app).delete('/api/me').set(as(adminA)).send({ password: 'Passw0rd!' });
  assert.equal(res.status, 409);
  assert.equal(w.users.some((u) => u._id === adminA._id), true);
});

test('consent is recorded for the caller with type and version', async () => {
  const res = await request(app).post('/api/me/consent').set(as(stu)).send({ type: 'ai_processing', version: '2026-11', userId: other._id });
  assert.equal(res.status, 201, res.text);
  assert.equal(w.consents.at(-1).userId, stu._id);
  assert.equal(w.consents.at(-1).institutionId, IDS.instA);
  assert.equal((await request(app).post('/api/me/consent').set(as(stu)).send({ type: 'nonsense', version: '1' })).status, 400);
  assert.equal((await request(app).post('/api/me/consent').set(as(stu)).send({ type: 'terms' })).status, 400);
});

test('sub-processor list is public and honest about what is in use', async () => {
  const res = await request(app).get('/api/compliance/subprocessors');
  assert.equal(res.status, 200);
  const by = Object.fromEntries(res.body.subprocessors.map((s) => [s.name, s.status]));
  for (const name of ['MongoDB Atlas', 'Google Gemini API', 'JDoodle', 'Judge0', 'AssemblyAI', 'Vercel', 'Cloudflare']) {
    assert.ok(name in by, name);
  }
  assert.equal(by['Google Gemini API'], 'in_use');
  assert.equal(by['Judge0'], 'planned');
  assert.equal(by['Vercel'], 'planned');
  assert.equal(by['Cloudflare'], 'planned');
});
