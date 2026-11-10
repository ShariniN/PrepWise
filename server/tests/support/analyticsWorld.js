// In-memory stand-ins for analyticsRepo and the AI usage store. Like the real repositories they
// filter by institutionId, so a controller that forgets to scope a query leaks data and a test fails.
import { mock } from 'node:test';
import analyticsRepo from '../../modules/analytics/analytics.repo.js';
import { usageRepo } from '../../services/aiUsage.js';
import { installQuestionWorld } from './questionWorld.js';
import { newId } from '../helpers.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const clone = (o) => (o == null ? o : structuredClone(o));
const inIds = (ids, v) => ids.some((i) => same(i, v));

export const installAnalyticsWorld = (world) => {
  const q = installQuestionWorld(world);
  const db = Object.assign(q, { interviews: [], cv: [], skills: [], aiCalls: {} });
  world.adb = db;

  mock.method(analyticsRepo, 'attemptsForStudents', async (inst, ids, { since = null, kinds = null } = {}) => db.attempts
    .filter((a) => same(a.institutionId, inst) && inIds(ids, a.userId) && (!since || new Date(a.createdAt) >= since) && (!kinds || kinds.includes(a.runKind)))
    .map((a) => { const c = clone(a); delete c.source; delete c.answer; return c; }));
  mock.method(analyticsRepo, 'interviewsForStudents', async (inst, ids) => db.interviews.filter((i) => same(i.institutionId, inst) && inIds(ids, i.userId)).map(clone));
  mock.method(analyticsRepo, 'cvCounts', async (inst, ids) => {
    const m = {};
    for (const c of db.cv.filter((x) => same(x.institutionId, inst) && inIds(ids, x.userId))) m[String(c.userId)] = (m[String(c.userId)] || 0) + 1;
    return Object.entries(m).map(([userId, count]) => ({ userId, count }));
  });
  mock.method(analyticsRepo, 'activeUserIds', async (inst, ids, since) => {
    const out = new Set();
    for (const a of db.attempts) if (same(a.institutionId, inst) && inIds(ids, a.userId) && ['run', 'submit'].includes(a.runKind) && new Date(a.createdAt) >= since) out.add(String(a.userId));
    for (const i of db.interviews) if (same(i.institutionId, inst) && inIds(ids, i.userId) && new Date(i.createdAt) >= since) out.add(String(i.userId));
    return [...out];
  });

  mock.method(usageRepo, 'getCalls', async (inst) => db.aiCalls[String(inst)] || 0);

  // seeding helper: one attempt row
  db.addAttempt = (fields) => {
    const a = { _id: newId(), runKind: 'submit', perTest: [], score: null, createdAt: new Date(), ...fields };
    db.attempts.push(a);
    return a;
  };
  return db;
};
