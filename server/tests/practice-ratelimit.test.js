// Per-user rate limit on running code. Separate file: the limit is read from the environment when the app loads.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
process.env.PRACTICE_RUN_LIMIT = '3';
const { makeWorld, IDS } = await import('./helpers.js');
const { installQuestionWorld } = await import('./support/questionWorld.js');
const { VmProvider } = await import('./support/vmChecker.js');
const exec = await import('../services/execution/index.js');
const { default: app } = await import('../app.js');

let w, db, s1, s2, q;
beforeEach(() => {
  w = makeWorld(); w.install(); db = installQuestionWorld(w);
  exec.resetCache(); exec.setProvider(new VmProvider());
  s1 = w.addUser({ email: 'a@a.edu', institutionId: IDS.instA });
  s2 = w.addUser({ email: 'b@a.edu', institutionId: IDS.instA });
  q = db.addQuestion({ institutionId: IDS.instA }, [{ input: '1', expectedOutput: '1', visible: true, institutionId: IDS.instA }]);
});
afterEach(() => { mock.restoreAll(); exec.setProvider(null); });

test('run is limited per user, not per address', async () => {
  const run = (u) => request(app).post(`/api/practice/questions/${q._id}/run`).set('Cookie', w.cookie(u))
    .send({ language: 'javascript', source: 'console.log(1)' });
  for (let i = 0; i < 3; i += 1) assert.equal((await run(s1)).status, 200);
  const limited = await run(s1);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.success, false);
  assert.equal((await run(s2)).status, 200); // another student from the same address is unaffected
});
