import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuardedTransport } from '../config/nodemailer.js';

const fakeTransport = () => {
  const sent = [];
  return { sent, sendMail: async (m) => { sent.push(m); return { messageId: 'x' }; } };
};

test('outside production, mail is not sent unless MAIL_IN_DEV=true', async () => {
  const real = fakeTransport();
  const logs = [];
  const t = createGuardedTransport(real, { env: { NODE_ENV: 'development' }, log: (m) => logs.push(m) });
  const info = await t.sendMail({ to: 'student@email.com', subject: 'OTP to Reset Password', html: 'code 123456' });
  assert.equal(real.sent.length, 0, 'nothing reaches the real mail server');
  assert.equal(info.suppressed, true);
  assert.match(logs.join(' '), /student@email\.com/);
});

test('outside production with MAIL_IN_DEV=true, mail is sent', async () => {
  const real = fakeTransport();
  const t = createGuardedTransport(real, { env: { NODE_ENV: 'development', MAIL_IN_DEV: 'true' }, log: () => {} });
  await t.sendMail({ to: 'a@b.test', subject: 's', html: 'h' });
  assert.equal(real.sent.length, 1);
});

test('in production, mail is always sent', async () => {
  const real = fakeTransport();
  const t = createGuardedTransport(real, { env: { NODE_ENV: 'production' }, log: () => {} });
  await t.sendMail({ to: 'a@b.test', subject: 's', html: 'h' });
  assert.equal(real.sent.length, 1);
});

test('a missing NODE_ENV counts as not production', async () => {
  const real = fakeTransport();
  const t = createGuardedTransport(real, { env: {}, log: () => {} });
  await t.sendMail({ to: 'a@b.test', subject: 's', html: 'h' });
  assert.equal(real.sent.length, 0);
});
