// Voice answers go to Groq's Whisper model. No real network: the OpenAI-compatible client is a stub.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import { transcribe, TranscriptionUnavailableError, transcriptionService } from '../services/transcription.js';
import { usageRepo, resetAiCapCache } from '../services/aiUsage.js';
import app from '../app.js';

const MESSAGE = "Voice answers aren't available right now. Type your answer instead.";

let w, student;
beforeEach(() => {
  delete process.env.GROQ_API_KEY;
  w = makeWorld(); w.install();
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  for (const k of ['error', 'log', 'warn']) mock.method(console, k, () => {});
});
afterEach(() => { mock.restoreAll(); delete process.env.GROQ_API_KEY; });

const upload = () => request(app).post('/api/interviews/transcribe').set('Cookie', w.cookie(student));

test('no GROQ_API_KEY → 503 TRANSCRIPTION_UNAVAILABLE', async () => {
  const res = await upload().attach('audio', Buffer.from('fake audio'), { filename: 'a.webm', contentType: 'audio/webm' });
  assert.equal(res.status, 503, res.text);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'TRANSCRIPTION_UNAVAILABLE');
  assert.equal(res.body.message, MESSAGE);
  await assert.rejects(transcribe(Buffer.from('x'), { filename: 'a.webm', mimetype: 'audio/webm' }), TranscriptionUnavailableError);
  // checked before the upload is read: no file at all gives the same answer
  const noFile = await upload().send({});
  assert.equal(noFile.status, 503, noFile.text);
  assert.equal(noFile.body.code, 'TRANSCRIPTION_UNAVAILABLE');
});

test('stub client receives model whisper-large-v3-turbo and the filler prompt', async () => {
  const calls = [];
  const client = { audio: { transcriptions: { create: async (args) => { calls.push(args); return { text: ' Um, so I built an API. ', duration: 4.2 }; } } } };
  const out = await transcribe(Buffer.from('fake audio'), { filename: 'answer.webm', mimetype: 'audio/webm' }, { client });
  assert.deepEqual(out, { text: 'Um, so I built an API.', durationSec: 4.2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'whisper-large-v3-turbo');
  assert.equal(calls[0].response_format, 'verbose_json');
  assert.equal(calls[0].prompt, 'Um, uh, so, like, you know, I mean.');
  assert.equal(calls[0].file.name, 'answer.webm');
  assert.equal(calls[0].file.type, 'audio/webm');
});

test('a failing provider call becomes TranscriptionUnavailableError', async () => {
  const client = { audio: { transcriptions: { create: async () => { throw Object.assign(new Error('rate limited'), { status: 429 }); } } } };
  await assert.rejects(transcribe(Buffer.from('x'), {}, { client }), TranscriptionUnavailableError);
});

test('no audio file → 400', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  const res = await upload().send({});
  assert.equal(res.status, 400, res.text);
  assert.equal(res.body.success, false);
});

test('the route returns the text and duration, and a provider failure is a 503 with the plain message', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  const seen = [];
  mock.method(transcriptionService, 'transcribe', async (buffer, meta) => { seen.push({ size: buffer.length, ...meta }); return { text: 'hello there', durationSec: 2 }; });
  const ok = await upload().attach('audio', Buffer.from('fake audio'), { filename: 'recording.webm', contentType: 'audio/webm' });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(ok.body, { success: true, text: 'hello there', durationSec: 2 });
  assert.deepEqual(seen, [{ size: 10, filename: 'recording.webm', mimetype: 'audio/webm' }]);

  transcriptionService.transcribe.mock.mockImplementation(async () => { throw new TranscriptionUnavailableError('boom'); });
  const down = await upload().attach('audio', Buffer.from('fake audio'), { filename: 'recording.webm', contentType: 'audio/webm' });
  assert.equal(down.status, 503);
  assert.equal(down.body.code, 'TRANSCRIPTION_UNAVAILABLE');
  assert.equal(down.body.message, MESSAGE);
});

test('a non-audio upload is refused with 400', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  const res = await upload().attach('audio', Buffer.from('text'), { filename: 'a.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400, res.text);
});

test('transcription counts against the monthly AI cap; over the cap is 503 TRANSCRIPTION_UNAVAILABLE and nothing is sent', async () => {
  process.env.GROQ_API_KEY = 'test-key';
  resetAiCapCache();
  let calls = 0;
  const metered = [];
  mock.method(usageRepo, 'getCap', async () => 1);
  mock.method(usageRepo, 'increment', async (institutionId) => { metered.push(String(institutionId)); calls += 1; return { calls }; });
  const sent = mock.method(transcriptionService, 'transcribe', async () => ({ text: 'hello', durationSec: 1 }));
  const audio = () => upload().attach('audio', Buffer.from('fake audio'), { filename: 'a.webm', contentType: 'audio/webm' });
  const ok = await audio();
  assert.equal(ok.status, 200, ok.text);
  const over = await audio();
  assert.equal(over.status, 503);
  assert.equal(over.body.code, 'TRANSCRIPTION_UNAVAILABLE');
  assert.equal(over.body.message, MESSAGE);
  assert.equal(sent.mock.callCount(), 1, 'nothing is sent to the provider over the cap');
  assert.deepEqual(metered, [IDS.instA, IDS.instA]);
  resetAiCapCache();
});

// Last in this file: it uses up the per-minute allowance.
test('voice answers are rate limited to 20 a minute', async () => {
  const statuses = [];
  for (let i = 0; i < 25; i++) statuses.push((await upload().attach('audio', Buffer.from('x'), { filename: 'a.webm', contentType: 'audio/webm' })).status);
  const first429 = statuses.indexOf(429);
  assert.ok(first429 > 0 && first429 <= 20, statuses.join(','));
  assert.ok(statuses.slice(first429).every((st) => st === 429), statuses.join(','));
});
