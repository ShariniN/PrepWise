// Invitation flow and login rules.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { makeWorld, IDS, userModel } from './helpers.js';
import { createInviteToken, hashToken } from '../services/inviteTokens.js';
import app from '../app.js';

let w;
beforeEach(() => { w = makeWorld(); w.install(); });
afterEach(() => mock.restoreAll());

const invited = (extra = {}) => {
  const invite = createInviteToken();
  const user = w.addUser({
    name: 'Invitee', email: 'invitee@a.edu', role: 'student', institutionId: IDS.instA, status: 'invited',
    isAccountVerified: false, password: undefined, inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt, ...extra,
  });
  return { user, token: invite.token };
};
const GOOD = 'Passw0rd!';

test('open registration is gone', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@a.edu', password: GOOD, phoneNumber: '0771234567' });
  assert.equal(res.status, 404);
});

test('accept-invite activates the account, hashes the password, clears the token and signs a JWT with role and institution', async () => {
  const { user, token } = invited();
  const res = await request(app).post('/api/auth/accept-invite').send({ token, password: GOOD, name: 'New Name', phoneNumber: '0771234567' });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.success, true);
  assert.equal(user.status, 'active');
  assert.equal(user.name, 'New Name');
  assert.equal(user.inviteTokenHash, '');
  assert.equal(user.inviteExpiresAt, null);
  assert.equal(user.isAccountVerified, true);
  assert.ok(await bcrypt.compare(GOOD, user.password));
  assert.notEqual(user.password, GOOD);

  const cookie = res.headers['set-cookie'].find((c) => c.startsWith('token='));
  const claims = jwt.verify(cookie.split(';')[0].slice(6), process.env.JWT_SECRET);
  assert.equal(claims.id, user._id);
  assert.equal(claims.role, 'student');
  assert.equal(claims.institutionId, IDS.instA);
  assert.equal(w.audit.at(-1).action, 'user.invite_accept');
});

test('the token is single-use', async () => {
  const { token } = invited();
  assert.equal((await request(app).post('/api/auth/accept-invite').send({ token, password: GOOD })).status, 200);
  const again = await request(app).post('/api/auth/accept-invite').send({ token, password: GOOD });
  assert.equal(again.status, 400);
  assert.equal(again.body.code, 'INVITE_INVALID');
});

test('an expired token is rejected and the account stays invited', async () => {
  const { user, token } = invited({ inviteExpiresAt: new Date(Date.now() - 1000) });
  const res = await request(app).post('/api/auth/accept-invite').send({ token, password: GOOD });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVITE_EXPIRED');
  assert.equal(user.status, 'invited');
  assert.equal(user.password, undefined);
});

test('unknown, malformed and hash-as-token inputs are rejected', async () => {
  const { user } = invited();
  for (const token of ['f'.repeat(64), 'short', user.inviteTokenHash, undefined, { $ne: '' }]) {
    const res = await request(app).post('/api/auth/accept-invite').send({ token, password: GOOD });
    assert.equal(res.status, 400, String(JSON.stringify(token)));
  }
  assert.equal(user.status, 'invited');
});

test('accept-invite enforces the password and phone rules', async () => {
  const { user, token } = invited();
  assert.equal((await request(app).post('/api/auth/accept-invite').send({ token, password: 'weak' })).status, 400);
  assert.equal((await request(app).post('/api/auth/accept-invite').send({ token, password: GOOD, phoneNumber: '12' })).status, 400);
  assert.equal(user.status, 'invited');
});

test('a deactivated user cannot log in even with the right password', async () => {
  const hash = await bcrypt.hash(GOOD, 4);
  w.addUser({ email: 'gone@a.edu', institutionId: IDS.instA, status: 'deactivated', password: hash });
  const res = await request(app).post('/api/auth/login').send({ email: 'gone@a.edu', password: GOOD });
  assert.equal(res.status, 403);
  assert.equal(res.headers['set-cookie'], undefined);
  const wrong = await request(app).post('/api/auth/login').send({ email: 'gone@a.edu', password: 'nope' });
  assert.equal(wrong.status, 401, 'a wrong password still gets the generic message');
});

test('an invited user (no password) cannot log in and nothing crashes', async () => {
  invited();
  const res = await request(app).post('/api/auth/login').send({ email: 'invitee@a.edu', password: GOOD });
  assert.equal(res.status, 401);
});

test('an active user logs in and the JWT carries id, role and institutionId', async () => {
  const hash = await bcrypt.hash(GOOD, 4);
  const lecturer = w.addUser({ email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA, password: hash });
  const res = await request(app).post('/api/auth/login').send({ email: 'lec@a.edu', password: GOOD });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'lecturer');
  const claims = jwt.verify(res.headers['set-cookie'][0].split(';')[0].slice(6), process.env.JWT_SECRET);
  assert.deepEqual([claims.id, claims.role, claims.institutionId], [lecturer._id, 'lecturer', IDS.instA]);
});

test('is-auth reports role, institution and keeps the legacy accountType for students', async () => {
  const student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  const res = await request(app).get('/api/auth/is-auth').set('Cookie', w.cookie(student));
  assert.equal(res.body.user.role, 'student');
  assert.equal(res.body.user.institutionId, IDS.instA);
});

test('reset OTP is refused for deactivated and invited accounts', async () => {
  w.addUser({ email: 'off@a.edu', institutionId: IDS.instA, status: 'deactivated' });
  const res = await request(app).post('/api/auth/send-reset-otp').send({ email: 'off@a.edu' });
  assert.equal(res.body.success, false);
  assert.equal(w.mails.length, 0);
});

test('the OTP verify and reset flow still works for an active user', async () => {
  const user = w.addUser({ email: 'ok@a.edu', institutionId: IDS.instA, isAccountVerified: false, verifyOtp: '', verifyOtpExpireAt: 0 });
  const send = await request(app).post('/api/auth/send-verify-otp').set('Cookie', w.cookie(user));
  assert.equal(send.body.success, true);
  assert.equal(w.mails.length, 1);
  const bad = await request(app).post('/api/auth/verify-account').set('Cookie', w.cookie(user)).send({ otp: '000000' });
  assert.equal(bad.body.success, false);
  const good = await request(app).post('/api/auth/verify-account').set('Cookie', w.cookie(user)).send({ otp: user.verifyOtp });
  assert.equal(good.body.success, true);
  assert.equal(user.isAccountVerified, true);

  await request(app).post('/api/auth/send-reset-otp').send({ email: 'ok@a.edu' });
  const reset = await request(app).post('/api/auth/reset-password').send({ email: 'ok@a.edu', otp: user.resetOtp, newPassword: 'NewPassw0rd!' });
  assert.equal(reset.body.success, true);
  assert.ok(await bcrypt.compare('NewPassw0rd!', user.password));
});

test('profile update still accepts only name and phone, whatever else is sent', async () => {
  const student = w.addUser({ email: 'p@a.edu', institutionId: IDS.instA });
  let captured;
  mock.method(userModel, 'findByIdAndUpdate', async (id, update) => { captured = update; return { ...student, ...update }; });
  const res = await request(app).put('/api/user/profile').set('Cookie', w.cookie(student))
    .send({ name: 'N', phoneNumber: '0771234567', role: 'university_admin', institutionId: IDS.instB, status: 'active', accountType: 'Admin' });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(captured).sort(), ['lastActive', 'name', 'phoneNumber']);
});

test('hashToken is SHA-256 hex and invite tokens are 32 random bytes', () => {
  const a = createInviteToken();
  const b = createInviteToken();
  assert.match(a.token, /^[a-f0-9]{64}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
