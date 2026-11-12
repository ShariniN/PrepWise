// Email-domain self-signup and verification by one-time link.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { makeWorld, IDS, userModel, peopleRepo, transporter } from './helpers.js';
import { hashToken } from '../services/inviteTokens.js';
import { seatLockRepo, withSeatLock, SeatLockBusyError } from '../services/seatLock.js';
import Institution from '../models/Institution.js';
import { signupRepo } from '../modules/auth/auth.signup.js';
import { seatsUsed } from '../modules/people/people.service.js';
import app from '../app.js';

const GOOD = 'Passw0rd!';
let w;

beforeEach(() => {
  w = makeWorld();
  w.install();
  Object.assign(w.institutions[IDS.instA], { allowedEmailDomains: ['a.edu'], selfSignup: true });
  mock.method(signupRepo, 'findSignupInstitution', async (domain) =>
    Object.values(w.institutions).find((i) => i.selfSignup && i.status === 'active' && i.allowedEmailDomains.includes(domain)) || null);
  const base = userModel.findOne;
  mock.method(userModel, 'findOne', async (q) => {
    if (q.emailVerifyTokenHash) return w.users.find((u) => u.emailVerifyTokenHash === q.emailVerifyTokenHash) || null;
    return base.call(userModel, q);
  });
  // Stores only the fields given, like the real create (the test world otherwise fills in a password).
  mock.method(signupRepo, 'createUser', async (data) => w.addUser({ password: undefined, ...data }));
  // In-memory seat lock with the same rule as the real query: free when unset or expired.
  mock.method(seatLockRepo, 'acquire', async (id, now, until) => {
    const inst = w.institutions[String(id)];
    if (inst.seatLockUntil && inst.seatLockUntil >= now) return null;
    inst.seatLockUntil = until;
    return { _id: id };
  });
  mock.method(seatLockRepo, 'release', async (id, until) => {
    const inst = w.institutions[String(id)];
    if (inst.seatLockUntil === until) inst.seatLockUntil = null;
  });
});
afterEach(() => mock.restoreAll());

const signup = (body = {}) => request(app).post('/api/auth/signup').send({ name: 'New Student', email: 'new@a.edu', ...body });
const tokenOf = (res) => new URL(res.body.devVerificationLink).searchParams.get('token');
const verify = (token, password = GOOD) => request(app).post('/api/auth/verify-email').send({ token, password });
const verifyNoPassword = (token) => request(app).post('/api/auth/verify-email').send({ token });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

test('signup with an allowed domain creates an unverified student and sends a link', async () => {
  const res = await signup();
  assert.equal(res.status, 200, res.text);
  assert.deepEqual([res.body.success, res.body.message], [true, 'Check your email for a link to finish signing up.']);
  const user = w.users.find((u) => u.email === 'new@a.edu');
  assert.equal(user.status, 'unverified');
  assert.equal(user.role, 'student');
  assert.equal(String(user.institutionId), IDS.instA);
  assert.equal(user.isAccountVerified, false);
  assert.equal(user.password, undefined);

  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].to, 'new@a.edu');
  const link = w.mails[0].html.match(/href="([^"]+verify-email[^"]+)"/)[1];
  assert.match(link, /^http:\/\/localhost:5173\/verify-email\?token=[a-f0-9]{64}$/);
  const token = new URL(link).searchParams.get('token');
  assert.equal(user.emailVerifyTokenHash, hashToken(token));
  assert.notEqual(user.emailVerifyTokenHash, token);
  const ttl = new Date(user.emailVerifyExpiresAt).getTime() - Date.now();
  assert.ok(ttl > 23.9 * 3600e3 && ttl <= 24 * 3600e3);
  assert.equal(res.body.devVerificationLink, link);
});

test('signup with another domain is 400 SIGNUP_DOMAIN_NOT_ALLOWED', async () => {
  const res = await signup({ email: 'x@other.com' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'SIGNUP_DOMAIN_NOT_ALLOWED');
  assert.equal(res.body.message, "Sign-up isn't open for this email address. Use your university email, or ask your university for an invitation.");
  assert.equal(w.users.length, 0);
});

test('signup when selfSignup is off is 400 SIGNUP_DOMAIN_NOT_ALLOWED', async () => {
  w.institutions[IDS.instA].selfSignup = false;
  const res = await signup();
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'SIGNUP_DOMAIN_NOT_ALLOWED');
});

test('signup validates name and email, and needs no password', async () => {
  assert.equal((await signup({ name: '' })).status, 400);
  assert.equal((await signup({ email: 'nope' })).status, 400);
  assert.equal((await signup({ email: { $ne: '' } })).status, 400);
  assert.equal(w.users.length, 0);
  assert.equal((await signup()).status, 200);
});

test('a password sent at signup is accepted for compatibility and ignored', async () => {
  const res = await signup({ password: 'Attacker1!' });
  assert.equal(res.status, 200, res.text);
  assert.equal(w.users[0].password, undefined);
  assert.equal((await signup({ email: 'weak@a.edu', password: 'weak' })).status, 200);
});

test('signup for an existing email answers the same generic 200 and sends nothing', async () => {
  w.addUser({ email: 'taken@a.edu', institutionId: IDS.instA, password: 'h' });
  const res = await signup({ email: 'taken@a.edu' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.success, res.body.message], [true, 'Check your email for a link to finish signing up.']);
  assert.equal(res.body.devVerificationLink, undefined);
  assert.equal(w.mails.length, 0);
  assert.equal(w.users.length, 1);
});

test('re-signup cannot set or keep a password', async () => {
  const first = await signup({ password: 'Attacker1!' });
  const user = w.users[0];
  const second = await signup({ password: 'Other1234!' });
  assert.equal(second.status, 200);
  assert.equal(w.users.length, 1);
  assert.equal(user.password, undefined);
  assert.notEqual(tokenOf(second), tokenOf(first));
  assert.equal(user.emailVerifyTokenHash, hashToken(tokenOf(second)));
  assert.equal((await verify(tokenOf(first))).body.code, 'VERIFY_INVALID');
  assert.equal((await verify(tokenOf(second), 'Victim123!')).status, 200);
  // Only the password chosen at verify works; neither signup password does.
  assert.equal((await login('new@a.edu', 'Attacker1!')).status, 401);
  assert.equal((await login('new@a.edu', 'Other1234!')).status, 401);
  assert.equal((await login('new@a.edu', 'Victim123!')).status, 200);
});

test('verify without a password is 400 and the token still works', async () => {
  const token = tokenOf(await signup());
  for (const send of [() => verifyNoPassword(token), ...['', 'weak', 'nouppercase1!', null, { $ne: '' }].map((pw) => () => verify(token, pw))]) {
    const res = await send();
    assert.equal(res.status, 400, res.text);
    assert.equal(res.body.code, 'WEAK_PASSWORD');
    assert.equal(res.body.message, 'Password must be at least 6 characters long, include one uppercase letter, one number, and one special character');
    assert.ok(!res.headers['set-cookie']);
  }
  const user = w.users[0];
  assert.equal(user.status, 'unverified');
  assert.equal(user.password, undefined);
  assert.equal(user.emailVerifyTokenHash, hashToken(token));
  assert.equal((await verify(token)).status, 200);
});

test('an invalid or expired token is reported before a missing password', async () => {
  const token = tokenOf(await signup());
  assert.equal((await verifyNoPassword('f'.repeat(64))).body.code, 'VERIFY_INVALID');
  w.users[0].emailVerifyExpiresAt = new Date(Date.now() - 1000);
  assert.equal((await verifyNoPassword(token)).body.code, 'VERIFY_EXPIRED');
});

test('the password set at verify is the login password', async () => {
  const token = tokenOf(await signup());
  const res = await verify(token, 'Chosen12!');
  assert.equal(res.status, 200, res.text);
  const user = w.users[0];
  assert.ok(await bcrypt.compare('Chosen12!', user.password));
  assert.equal((await login('new@a.edu', 'Chosen12!')).status, 200);
  assert.equal((await login('new@a.edu', GOOD)).status, 401);
});

test('signup with no seats left is 409 SEAT_LIMIT_REACHED', async () => {
  for (let i = 0; i < 3; i++) w.addUser({ email: `s${i}@a.edu`, institutionId: IDS.instA });
  const res = await signup();
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'SEAT_LIMIT_REACHED');
  assert.equal(w.users.length, 3);
});

test('verify activates once, signs the student in, and the second use is 400 VERIFY_INVALID', async () => {
  const token = tokenOf(await signup());
  const res = await verify(token);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.success, true);
  assert.equal(res.body.role, 'student');
  assert.equal(res.body.isAccountVerified, true);
  assert.equal(res.body.needsVerification, false);
  assert.ok(res.headers['set-cookie'].some((c) => c.startsWith('token=')));
  const user = w.users[0];
  assert.equal(user.status, 'active');
  assert.equal(user.isAccountVerified, true);
  assert.equal(user.emailVerifyTokenHash, '');
  assert.equal(user.emailVerifyExpiresAt, null);

  const again = await verify(token);
  assert.equal(again.status, 400);
  assert.equal(again.body.code, 'VERIFY_INVALID');
});

test('malformed and unknown tokens are 400 VERIFY_INVALID', async () => {
  await signup();
  for (const t of ['f'.repeat(64), 'short', undefined, { $ne: '' }, w.users[0].emailVerifyTokenHash]) {
    const res = await verify(t);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VERIFY_INVALID');
  }
  assert.equal(w.users[0].status, 'unverified');
});

test('expired token is 400 VERIFY_EXPIRED', async () => {
  const token = tokenOf(await signup());
  w.users[0].emailVerifyExpiresAt = new Date(Date.now() - 1000);
  const res = await verify(token);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'VERIFY_EXPIRED');
  assert.equal(w.users[0].status, 'unverified');
});

test('last seat: first verify activates, second is 409 SEAT_LIMIT_REACHED and stays unverified', async () => {
  for (let i = 0; i < 2; i++) w.addUser({ email: `s${i}@a.edu`, institutionId: IDS.instA });
  const t1 = tokenOf(await signup({ email: 'one@a.edu' }));
  const t2 = tokenOf(await signup({ email: 'two@a.edu' }));
  assert.equal((await verify(t1)).status, 200);
  const res = await verify(t2);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'SEAT_LIMIT_REACHED');
  const two = w.users.find((u) => u.email === 'two@a.edu');
  assert.equal(two.status, 'unverified');
  assert.equal(two.password, undefined);
  assert.equal(two.emailVerifyTokenHash, hashToken(t2));
});

test('unverified students do not use a seat', async () => {
  w.addUser({ email: 'u@a.edu', institutionId: IDS.instA, status: 'unverified' });
  assert.equal(await seatsUsed(w.institutions[IDS.instA]), 0);
});

test('unverified login is 403 EMAIL_NOT_VERIFIED', async () => {
  w.addUser({ email: 'un@a.edu', institutionId: IDS.instA, status: 'unverified', isAccountVerified: false, password: await bcrypt.hash(GOOD, 4) });
  const res = await request(app).post('/api/auth/login').send({ email: 'un@a.edu', password: GOOD });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(res.body.message, 'Verify your email first. We can send a new link.');
  assert.ok(!res.headers['set-cookie']);
});

test('an unverified account cannot use a session', async () => {
  const u = w.addUser({ email: 'un@a.edu', institutionId: IDS.instA, status: 'unverified' });
  const res = await request(app).get('/api/auth/is-auth').set('Cookie', w.cookie(u));
  assert.equal(res.status, 401);
});

test('resend-verification gives one generic answer and sends a link only to unverified accounts', async () => {
  await signup();
  const old = w.users[0].emailVerifyTokenHash;
  w.mails.length = 0;
  w.addUser({ email: 'act@a.edu', institutionId: IDS.instA });
  const msg = 'If that address has an account waiting for verification, we have sent a new link.';
  const a = await request(app).post('/api/auth/resend-verification').send({ email: 'new@a.edu' });
  const b = await request(app).post('/api/auth/resend-verification').send({ email: 'act@a.edu' });
  const c = await request(app).post('/api/auth/resend-verification').send({ email: 'ghost@a.edu' });
  const d = await request(app).post('/api/auth/resend-verification').send({});
  for (const r of [a, b, c, d]) assert.deepEqual([r.status, r.body.success, r.body.message], [200, true, msg]);
  assert.equal(w.mails.length, 1);
  assert.equal(w.mails[0].to, 'new@a.edu');
  assert.notEqual(w.users[0].emailVerifyTokenHash, old);
  assert.equal(b.body.devVerificationLink, undefined);
});

test('devVerificationLink is absent when NODE_ENV=production', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = await signup();
    assert.equal(res.status, 200);
    assert.equal(res.body.devVerificationLink, undefined);
    assert.equal(w.mails.length, 1);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('old OTP routes are 404', async () => {
  const u = w.addUser({ email: 'o@a.edu', institutionId: IDS.instA });
  for (const p of ['/api/auth/send-verify-otp', '/api/auth/verify-account']) {
    const res = await request(app).post(p).set('Cookie', w.cookie(u)).send({ otp: '123456' });
    assert.equal(res.status, 404, p);
  }
});

test('user has no OTP verify fields but keeps the reset ones', () => {
  const paths = userModel.schema.paths;
  assert.ok(!('verifyOtp' in paths));
  assert.ok(!('verifyOtpExpireAt' in paths));
  assert.ok('resetOtp' in paths && 'resetOtpExpireAt' in paths);
});

// Make the seat count and the save yield, so concurrent requests really interleave.
const slowDown = () => {
  const count = peopleRepo.countStudentsByStatus;
  mock.method(peopleRepo, 'countStudentsByStatus', async (id) => {
    await new Promise(setImmediate);
    const result = await count(id);
    await new Promise(setImmediate);
    return result;
  });
  for (const u of w.users) {
    const save = u.save;
    u.save = async function slowSave() { await new Promise(setImmediate); return save.call(this); };
  }
};

test('concurrent verifies for the last seat: exactly one activates', async () => {
  for (let i = 0; i < 2; i++) w.addUser({ email: `s${i}@a.edu`, institutionId: IDS.instA });
  const t1 = tokenOf(await signup({ email: 'one@a.edu' }));
  const t2 = tokenOf(await signup({ email: 'two@a.edu' }));
  slowDown();
  const [a, b] = await Promise.all([verify(t1), verify(t2)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find((r) => r.status === 409).body.code, 'SEAT_LIMIT_REACHED');
  assert.equal(w.users.filter((u) => u.status === 'active').length, 3);
  const pending = w.users.filter((u) => u.status === 'unverified');
  assert.equal(pending.length, 1);
  assert.notEqual(pending[0].emailVerifyTokenHash, '');
  assert.equal(w.institutions[IDS.instA].seatLockUntil, null);
});

test('concurrent double-submit of one token activates once', async () => {
  const token = tokenOf(await signup());
  slowDown();
  const [a, b] = await Promise.all([verify(token), verify(token)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  assert.equal([a, b].find((r) => r.status === 400).body.code, 'VERIFY_INVALID');
  assert.equal(w.users[0].status, 'active');
  assert.equal(w.audit.filter((x) => x.action === 'user.verify_email').length, 1);
});

test('an expired seat lock is taken over', async () => {
  const token = tokenOf(await signup());
  w.institutions[IDS.instA].seatLockUntil = new Date(Date.now() - 1000);
  const res = await verify(token);
  assert.equal(res.status, 200);
  assert.equal(w.institutions[IDS.instA].seatLockUntil, null);
});

test('a lock that stays held makes verify answer 503 TRY_AGAIN and leaves the account unverified', async () => {
  const token = tokenOf(await signup());
  w.institutions[IDS.instA].seatLockUntil = new Date(Date.now() + 60000);
  const res = await verify(token);
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'TRY_AGAIN');
  assert.equal(res.body.message, 'Too many people are signing up right now. Try again in a moment.');
  assert.equal(w.users[0].status, 'unverified');
});

test('withSeatLock releases the lock when the work throws and gives up with SeatLockBusyError', async () => {
  await assert.rejects(withSeatLock(IDS.instA, async () => { throw new Error('boom'); }), /boom/);
  assert.equal(w.institutions[IDS.instA].seatLockUntil, null);
  w.institutions[IDS.instA].seatLockUntil = new Date(Date.now() + 60000);
  await assert.rejects(withSeatLock(IDS.instA, async () => 1, { waitMs: 50 }), SeatLockBusyError);
});

test('seat lock acquire asks for an unset, missing or expired lock', async () => {
  seatLockRepo.acquire.mock.restore();
  const seen = [];
  mock.method(Institution, 'findOneAndUpdate', async (filter, update) => { seen.push([filter, update]); return null; });
  const now = new Date();
  const until = new Date(now.getTime() + 5000);
  await seatLockRepo.acquire(IDS.instA, now, until);
  assert.deepEqual(seen[0][0].$or, [{ seatLockUntil: null }, { seatLockUntil: { $exists: false } }, { seatLockUntil: { $lt: now } }]);
  assert.deepEqual(seen[0][1], { $set: { seatLockUntil: until } });
});

test('a racing signup that hits the duplicate-email index gets the same generic 200', async () => {
  mock.method(signupRepo, 'createUser', async () => { throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); });
  const res = await signup();
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Check your email for a link to finish signing up.');
  assert.equal(res.body.devVerificationLink, undefined);
  assert.equal(w.mails.length, 0);
});

test('a failed verification email is logged but the answer stays the generic 200', async () => {
  const errors = [];
  mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  mock.method(transporter, 'sendMail', async () => { throw new Error('smtp down'); });
  const res = await signup();
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(errors.some((e) => /Verification email failed: smtp down/.test(e)));
});
