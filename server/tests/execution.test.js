// Execution service: provider selection, verdict mapping, cache, outage handling. No network: HTTP is faked.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import app from '../app.js';
import * as exec from '../services/execution/index.js';
import Judge0Provider from '../services/execution/judge0Provider.js';
import JDoodleProvider from '../services/execution/jdoodleProvider.js';
import { mapJudge0Status } from '../services/execution/verdicts.js';
import { normalizeLanguage, supportedLanguages } from '../services/execution/languages.js';
import { VmProvider, runJs } from './support/vmChecker.js';

let w, student;
beforeEach(() => {
  w = makeWorld(); w.install();
  student = w.addUser({ email: 's@a.edu', institutionId: IDS.instA });
  exec.resetCache();
  exec.setProvider(null);
  mock.method(console, 'error', () => {});
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

test('judge0 status ids map to the right verdicts', () => {
  assert.equal(mapJudge0Status(3), 'accepted');
  assert.equal(mapJudge0Status(4), 'wrong_answer');
  assert.equal(mapJudge0Status(5), 'time_limit');
  assert.equal(mapJudge0Status(6), 'compile_error');
  for (const id of [7, 8, 9, 10, 11, 12, 14]) assert.equal(mapJudge0Status(id), 'runtime_error');
  assert.equal(mapJudge0Status(11, { memoryKb: 300000, memoryLimitKb: 256000 }), 'memory_limit');
  assert.equal(mapJudge0Status(13), 'unavailable');
  assert.equal(mapJudge0Status(99), 'unavailable');
});

test('language table: aliases resolve, sql is not offered', () => {
  assert.equal(normalizeLanguage('Node.js'), 'javascript');
  assert.equal(normalizeLanguage('c++'), 'cpp');
  assert.equal(normalizeLanguage('python3'), 'python');
  assert.equal(normalizeLanguage('sql'), null);
  assert.equal(normalizeLanguage('constructor'), null);
  assert.deepEqual(supportedLanguages().sort(), ['c', 'cpp', 'csharp', 'go', 'java', 'javascript', 'php', 'python']);
});

const fakeJudge0Http = (finals, { failPost } = {}) => {
  const log = { posts: [], gets: [] };
  let polls = 0;
  return {
    log,
    post: async (url, body, opts) => {
      log.posts.push({ url, body, headers: opts.headers });
      if (failPost) throw Object.assign(new Error('boom'), failPost);
      return { data: body.submissions.map((_, i) => ({ token: `t${i}` })) };
    },
    get: async (url, opts) => {
      log.gets.push({ url, params: opts.params });
      polls += 1;
      // first poll: everything still processing; second: final
      return { data: { submissions: finals.map((f, i) => ({ token: `t${i}`, ...(polls === 1 ? { status_id: 2 } : f) })) } };
    },
  };
};

test('judge0 provider: batch submit, poll until final, map verdicts', async () => {
  const http = fakeJudge0Http([
    { status_id: 3, stdout: '42\n', stderr: null, compile_output: null, time: '0.012', memory: 3000 },
    { status_id: 5, stdout: '', time: '2.0', memory: 1000 },
    { status_id: 6, compile_output: 'error: expected ;', time: null, memory: null },
    { status_id: 11, stderr: 'ReferenceError', time: '0.1', memory: 2000 },
  ]);
  const p = new Judge0Provider({ url: 'http://j0/', apiKey: 'k', apiHost: 'judge0-ce.p.rapidapi.com', http, pollIntervalMs: 1 });
  const reqs = ['javascript', 'python', 'java', 'cpp'].map((language) => ({ language, source: 'x', stdin: 'in', limits: { timeMs: 1500, memoryKb: 128000 } }));
  const out = await p.runBatch(reqs);
  assert.deepEqual(out.map((o) => o.status), ['accepted', 'time_limit', 'compile_error', 'runtime_error']);
  assert.equal(out[0].stdout, '42\n');
  assert.equal(out[0].timeMs, 12);
  assert.equal(out[2].compileOutput, 'error: expected ;');
  const post = http.log.posts[0];
  assert.match(post.url, /^http:\/\/j0\/submissions\/batch\?base64_encoded=false$/);
  assert.deepEqual(post.body.submissions.map((s) => s.language_id), [63, 71, 62, 54]);
  assert.equal(post.body.submissions[0].cpu_time_limit, 1.5);
  assert.equal(post.body.submissions[0].memory_limit, 128000);
  assert.equal(post.headers['X-RapidAPI-Key'], 'k');
  assert.equal(post.headers['X-RapidAPI-Host'], 'judge0-ce.p.rapidapi.com');
  assert.equal(http.log.gets.length, 2);
});

test('judge0 provider: X-Auth-Token for judge0.com hosted; outages and internal errors become unavailable', async () => {
  const hosted = new Judge0Provider({ url: 'http://j0', apiKey: 'tok', http: fakeJudge0Http([{ status_id: 3, stdout: 'a' }]), pollIntervalMs: 1 });
  assert.equal(hosted.headers()['X-Auth-Token'], 'tok');
  assert.equal(hosted.headers()['X-RapidAPI-Key'], undefined);

  const down = new Judge0Provider({ url: 'http://j0', http: fakeJudge0Http([], { failPost: { code: 'ECONNREFUSED' } }) });
  await assert.rejects(down.run({ language: 'python', source: 'x' }), exec.ExecutionUnavailableError);
  const quota = new Judge0Provider({ url: 'http://j0', http: fakeJudge0Http([], { failPost: { response: { status: 429 } } }) });
  await assert.rejects(quota.run({ language: 'python', source: 'x' }), (e) => e.reason === 'quota');
  const internal = new Judge0Provider({ url: 'http://j0', http: fakeJudge0Http([{ status_id: 13 }]), pollIntervalMs: 1 });
  await assert.rejects(internal.run({ language: 'python', source: 'x' }), exec.ExecutionUnavailableError);
  const unconfigured = new Judge0Provider({ url: '' });
  await assert.rejects(unconfigured.run({ language: 'python', source: 'x' }), exec.ExecutionUnavailableError);
  await assert.rejects(hosted.run({ language: 'cobol', source: 'x' }), exec.UnsupportedLanguageError);
});

test('jdoodle provider infers verdicts from output and never fakes output when unconfigured', async () => {
  const http = { post: async () => ({ data: { output: 'hello\n', cpuTime: '0.01', memory: '1000', statusCode: 200 } }) };
  const p = new JDoodleProvider({ clientId: 'id', clientSecret: 'sec', http });
  const r = await p.run({ language: 'js', source: 'x' });
  assert.equal(r.status, 'accepted');
  assert.equal(r.stdout, 'hello\n');
  const tb = new JDoodleProvider({ clientId: 'id', clientSecret: 'sec', http: { post: async () => ({ data: { output: 'Traceback (most recent call last):\n  File', statusCode: 200 } }) } });
  assert.equal((await tb.run({ language: 'python', source: 'x' })).status, 'runtime_error');
  await assert.rejects(new JDoodleProvider({}).run({ language: 'python', source: 'x' }), exec.ExecutionUnavailableError);
});

test('provider selection: explicit env choice, auto-detect, and never a silent fake', () => {
  assert.equal(exec.providerFromEnv({}).name, 'unavailable');
  assert.equal(exec.providerFromEnv({ EXECUTION_PROVIDER: 'judge0', JUDGE0_URL: 'http://x' }).name, 'judge0');
  assert.equal(exec.providerFromEnv({ EXECUTION_PROVIDER: 'judge0' }).name, 'unavailable'); // asked for, not configured: no fallback
  assert.equal(exec.providerFromEnv({ EXECUTION_PROVIDER: 'jdoodle', JDOODLE_CLIENT_ID: 'a', JDOODLE_CLIENT_SECRET: 'b' }).name, 'jdoodle');
  assert.equal(exec.providerFromEnv({ EXECUTION_PROVIDER: 'jdoodle', JUDGE0_URL: 'http://x' }).name, 'unavailable');
  assert.equal(exec.providerFromEnv({ EXECUTION_PROVIDER: 'mock' }).name, 'unavailable');
  assert.equal(exec.providerFromEnv({ JUDGE0_URL: 'http://x' }).name, 'judge0');
  assert.equal(exec.providerFromEnv({ JDOODLE_CLIENT_ID: 'a', JDOODLE_CLIENT_SECRET: 'b' }).name, 'jdoodle');
});

test('identical runs are served from the cache; different stdin is a different run; outages are never cached', async () => {
  const p = new VmProvider();
  exec.setProvider(p);
  const req = { language: 'javascript', source: 'console.log(1+1)', stdin: '' };
  const a = await exec.run(req);
  const b = await exec.run(req);
  assert.equal(a.stdout, '2\n');
  assert.deepEqual(a, b);
  assert.equal(p.calls, 1);
  await exec.run({ ...req, stdin: 'other' });
  assert.equal(p.calls, 2);

  p.down = true;
  await assert.rejects(exec.run({ ...req, source: 'console.log(3)' }), exec.ExecutionUnavailableError);
  p.down = false;
  assert.equal((await exec.run({ ...req, source: 'console.log(3)' })).stdout, '3\n');
});

test('cache entries expire after the TTL and the LRU evicts the oldest', () => {
  let now = 0;
  const c = new exec.RunCache({ max: 2, ttlMs: 1000, now: () => now });
  c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
  assert.equal(c.get('b'), undefined); // least recently used went first
  assert.equal(c.get('a'), 1);
  now = 5000;
  assert.equal(c.get('a'), undefined);
});

test('/api/code/execute: unavailable gives 503 and no output; with a provider it keeps the client response shape', async () => {
  const down = await request(app).post('/api/code/execute').set('Cookie', w.cookie(student)).send({ script: 'print(1)', language: 'python3' });
  assert.equal(down.status, 503);
  assert.equal(down.body.verdict, 'unavailable');
  assert.equal(down.body.output, undefined);

  exec.setProvider(new VmProvider());
  const ok = await request(app).post('/api/code/execute').set('Cookie', w.cookie(student)).send({ script: 'console.log("hi")', language: 'nodejs', stdin: '' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.success, true);
  assert.equal(ok.body.output, 'hi\n');
  assert.equal(ok.body.statusCode, 200);
  assert.ok('executionTime' in ok.body && 'memory' in ok.body && 'error' in ok.body);

  const bad = await request(app).post('/api/code/execute').set('Cookie', w.cookie(student)).send({ script: 'x', language: 'cobol' });
  assert.equal(bad.status, 400);
  const errRun = await request(app).post('/api/interviews/execute-code').set('Cookie', w.cookie(student)).send({ script: 'throw new Error("no")', language: 'javascript' });
  assert.equal(errRun.status, 200);
  assert.equal(errRun.body.success, false);
  assert.equal(errRun.body.verdict, 'runtime_error');
});

test('vm checker enforces a hard timeout and reports compile errors', () => {
  assert.equal(runJs('while(true){}', '', { timeoutMs: 100 }).status, 'time_limit');
  assert.equal(runJs('let = ;').status, 'compile_error');
  assert.equal(runJs('const s=require("fs").readFileSync(0,"utf8");console.log(s.trim()+"!")', 'a').stdout, 'a!\n');
});
