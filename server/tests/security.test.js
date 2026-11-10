// Phase 0 security tests. No database is used: the user model is stubbed.
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.NODE_ENV = 'test';
delete process.env.JDOODLE_CLIENT_ID;
delete process.env.JDOODLE_CLIENT_SECRET;
delete process.env.ASSEMBLYAI_API_KEY;

import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../app.js';
import userModel from '../models/User.js';
import transporter from '../config/nodemailer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, '..');

const fakeUser = {
  _id: '64b000000000000000000001',
  name: 'Test Student',
  email: 'student@example.com',
  accountType: 'Fresher',
  role: 'student',
  isAccountVerified: true,
  toObject() {
    return { _id: this._id, name: this.name, email: this.email, accountType: this.accountType, role: this.role };
  },
};

const authCookie = () => {
  const token = jwt.sign({ id: fakeUser._id, userType: 'fresher' }, process.env.JWT_SECRET);
  return `token=${token}`;
};

beforeEach(() => {
  mock.method(userModel, 'findById', async () => fakeUser);
});

afterEach(() => {
  mock.restoreAll();
});

test('protected routes reject requests with no login', async () => {
  for (const [method, url] of [
    ['get', '/api/user/profile'],
    ['post', '/api/code/execute'],
    ['post', '/api/interviews/transcribe'],
    ['post', '/api/interviews/create'],
  ]) {
    const res = await request(app)[method](url);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${url} should require login`);
  }
});

test('student cannot reach the old admin user-management routes', async () => {
  const cookie = authCookie();
  const checks = [
    ['get', '/api/user/freshers'],
    ['get', '/api/user/freshers/64b000000000000000000002'],
    ['put', '/api/user/freshers/64b000000000000000000002'],
    ['delete', '/api/user/freshers/64b000000000000000000002'],
  ];
  for (const [method, url] of checks) {
    const res = await request(app)[method](url).set('Cookie', cookie);
    assert.equal(res.status, 404, `${method.toUpperCase()} ${url} should not exist`);
  }
});

test('premium upgrade routes no longer exist', async () => {
  const cookie = authCookie();
  for (const url of ['/api/user/upgrade-premium', '/api/user/downgrade-basic']) {
    const res = await request(app).put(url).set('Cookie', cookie);
    assert.equal(res.status, 404, `${url} should not exist`);
  }
});

test('server-side code execution and mock transcription endpoints are gone', async () => {
  const cookie = authCookie();
  for (const url of ['/api/interviews/execute-code-local', '/api/interviews/transcribe-mock']) {
    const res = await request(app).post(url).set('Cookie', cookie).send({ code: 'console.log(1)', language: 'javascript' });
    assert.equal(res.status, 404, `${url} should not exist`);
  }
});

test('profile update ignores role and plan fields from the client', async () => {
  let captured;
  mock.method(userModel, 'findByIdAndUpdate', async (id, update) => {
    captured = update;
    return { ...fakeUser, ...update };
  });

  const res = await request(app)
    .put('/api/user/profile')
    .set('Cookie', authCookie())
    .send({ name: 'New Name', phoneNumber: '0771234567', accountType: 'Admin', accountPlan: 'premium', isAccountVerified: true });

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(captured), ['$set']); // only $set (no $unset when a phone is sent)
  assert.deepEqual(Object.keys(captured.$set).sort(), ['lastActive', 'name', 'phoneNumber']);
});

test('code execution reports unavailable instead of returning fake output', async () => {
  const res = await request(app)
    .post('/api/code/execute')
    .set('Cookie', authCookie())
    .send({ script: 'print(1)', language: 'python3' });

  assert.equal(res.status, 503);
  assert.notEqual(res.body.success, true);
  assert.equal(res.body.output, undefined);
});

test('transcription reports not configured when no key is set', async () => {
  const res = await request(app)
    .post('/api/interviews/transcribe')
    .set('Cookie', authCookie())
    .attach('audio', Buffer.from('fake'), { filename: 'a.webm', contentType: 'audio/webm' });

  assert.equal(res.status, 503);
});

test('unknown API paths return JSON 404, not the web page', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('open registration was replaced by invitations (Phase 1)', async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'New Student',
    email: 'new@example.com',
    password: 'Passw0rd!',
    phoneNumber: '0771234567',
  });
  assert.equal(res.status, 404);
});

test('login with an unknown email returns 401 instead of crashing', async () => {
  mock.method(userModel, 'findOne', async () => null);
  const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'x' });
  assert.equal(res.status, 401);
});

test('source tree has no hard-coded API keys, deleted-model imports or local exec', () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (['node_modules', 'tests', 'test', 'uploads'].includes(e.name)) return [];
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
    });
  const offenders = [];
  for (const file of walk(serverDir)) {
    const src = fs.readFileSync(file, 'utf8');
    if (/\|\|\s*["'][0-9a-f]{32}["']/.test(src)) offenders.push(`${file}: hard-coded key fallback`);
    if (/trainerModel|AdminModel/.test(src)) offenders.push(`${file}: deleted model`);
    if (/child_process/.test(src)) offenders.push(`${file}: child_process`);
  }
  assert.deepEqual(offenders, []);
});
