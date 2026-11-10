// Profile settings (/api/user): phone validation (QA-03/06), change-password strength (QA-10),
// and CV uploads that are not PDFs (QA-14). No database: the user model is stubbed.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { makeWorld, IDS, userModel } from './helpers.js';
import app from '../app.js';

let w, student, updates;
beforeEach(async () => {
  w = makeWorld();
  w.install();
  student = w.addUser({ name: 'Stu', email: 'stu@a.edu', role: 'student', institutionId: IDS.instA, password: await bcrypt.hash('Old@1234', 4) });
  updates = [];
  mock.method(userModel, 'findByIdAndUpdate', (id, update) => {
    updates.push(update);
    const u = w.users.find((x) => String(x._id) === String(id));
    if (u) {
      Object.assign(u, update.$set || {});
      for (const k of Object.keys(update.$unset || {})) delete u[k];
    }
    // The controller may chain .select(); return a thenable that also has select().
    const p = Promise.resolve(u ? u.toObject() : null);
    p.select = () => p;
    return p;
  });
  mock.method(console, 'error', () => {});
  mock.method(console, 'log', () => {});
});
afterEach(() => mock.restoreAll());

const as = () => ({ Cookie: w.cookie(student) });
const putProfile = (body) => request(app).put('/api/user/profile').set(as()).send(body);

test('profile update rejects a malformed phone number with a clear 400', async () => {
  for (const phone of ['abc', '12345', '0771234567890123', '077 123 456x']) {
    const res = await putProfile({ name: 'Stu', phoneNumber: phone });
    assert.equal(res.status, 400, phone);
    assert.match(res.body.message, /10 to 15 digits/);
  }
  assert.equal(updates.length, 0, 'nothing is written');
});

test('profile update accepts 10 to 15 digits (spaces and dashes are ignored)', async () => {
  const res = await putProfile({ name: 'Stu', phoneNumber: '077-123 4567' });
  assert.equal(res.status, 200, res.text);
  assert.equal(student.phoneNumber, '0771234567');
});

test('profile update can change only the name, without a phone number', async () => {
  student.phoneNumber = '0771234567';
  const res = await putProfile({ name: 'New Name' });
  assert.equal(res.status, 200, res.text);
  assert.equal(student.name, 'New Name');
  assert.equal(student.phoneNumber, '0771234567', 'an absent phone is left unchanged');
});

test('profile update clears the optional phone with an empty string', async () => {
  student.phoneNumber = '0771234567';
  const res = await putProfile({ name: 'Stu', phoneNumber: '' });
  assert.equal(res.status, 200, res.text);
  assert.equal(student.phoneNumber, undefined);
});

test('profile update still needs a name of 1 to 100 characters', async () => {
  assert.equal((await putProfile({ phoneNumber: '0771234567' })).status, 400);
  assert.equal((await putProfile({ name: '   ' })).status, 400);
  assert.equal((await putProfile({ name: 'x'.repeat(101) })).status, 400);
});

test('a previously stored invalid phone is dropped on the next save instead of failing it', async () => {
  const doc = userModel.hydrate({
    _id: '0000000000000000000000aa', name: 'Old', email: 'old@a.edu', role: 'student', status: 'active',
    password: 'hashed-password', institutionId: IDS.instA, phoneNumber: 'abc',
  });
  doc.currentCV = { text: 'cv text', hash: 'h', fileName: 'cv.pdf', uploadedAt: new Date(), fileSize: 7 };
  await doc.validate(); // used to throw "Please enter a valid phone number" -> CV upload 500
  assert.equal(doc.phoneNumber, undefined);
  const spaced = userModel.hydrate({ _id: '0000000000000000000000ab', name: 'Old', email: 'old2@a.edu', role: 'student', status: 'active', password: 'hashed-password', institutionId: IDS.instA, phoneNumber: '077 123 4567' });
  spaced.name = 'Renamed';
  await spaced.validate();
  assert.equal(spaced.phoneNumber, '0771234567', 'a number with separators is kept as digits');
});

test('change password applies the same strength rule as accepting an invitation', async () => {
  const weak = await request(app).put('/api/user/change-password').set(as()).send({ currentPassword: 'Old@1234', newPassword: 'abcdef' });
  assert.equal(weak.status, 400);
  assert.match(weak.body.message, /uppercase letter, one number, and one special character/);
  const ok = await request(app).put('/api/user/change-password').set(as()).send({ currentPassword: 'Old@1234', newPassword: 'New@5678' });
  assert.equal(ok.status, 200, ok.text);
});

const FAKE_PDF = Buffer.from('this is a plain text file, not a PDF');

test('CV upload: a text file renamed .pdf is a clear 400, not a 500', async () => {
  const res = await request(app).put('/api/user/upload-cv').set(as()).attach('cv', FAKE_PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
  assert.equal(res.status, 400, res.text);
  assert.match(res.body.message, /Only PDF files are accepted/);
});

test('CV upload: a non-PDF type is a clear 400, not a 500', async () => {
  const res = await request(app).put('/api/user/upload-cv').set(as()).attach('cv', FAKE_PDF, { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400, res.text);
  assert.match(res.body.message, /Only PDF files are accepted/);
});

test('interview CV upload (process-cv) also refuses non-PDF files with 400', async () => {
  for (const contentType of ['application/pdf', 'text/plain']) {
    const res = await request(app).post('/api/interviews/process-cv').set(as()).attach('cv', FAKE_PDF, { filename: 'x.pdf', contentType });
    assert.equal(res.status, 400, `${contentType}: ${res.text}`);
    assert.match(res.body.error || res.body.message, /Only PDF files are accepted/);
  }
});

test('CV analyzer upload also refuses non-PDF files with 400', async () => {
  for (const contentType of ['application/pdf', 'text/plain']) {
    const res = await request(app).post('/api/analyze/analyze-resume').set(as())
      .field('jobDescriptions', JSON.stringify(['Backend developer with Node.js']))
      .attach('resume', FAKE_PDF, { filename: 'x.pdf', contentType });
    assert.equal(res.status, 400, `${contentType}: ${res.text}`);
    assert.match(res.body.message, /Only PDF files are accepted/);
  }
});
