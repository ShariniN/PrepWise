// In-memory stand-in for modules/dashboard/dashboard.repo.js. Like the real repository it filters by institutionId, but it returns
// FULL documents (CV text, secrets, hidden tests included) so the tests prove the controller's whitelists, not
// the fake's projection.
import { mock } from 'node:test';
import dashboardRepo from '../../modules/dashboard/dashboard.repo.js';
import { newId } from '../helpers.js';

const same = (a, b) => String(a ?? '') === String(b ?? '');
const clone = (o) => (o == null ? o : structuredClone(Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function'))));
const inIds = (ids, v) => ids.some((i) => same(i, v));

export const installDashboardWorld = (world) => {
  const db = { interviews: [], cvs: [], attempts: [] };
  world.ldb = db;
  const isStudent = (u, inst) => same(u.institutionId, inst) && u.role === 'student' && u.status === 'active';

  mock.method(dashboardRepo, 'listStudents', async (inst, { group } = {}) =>
    world.users.filter((u) => isStudent(u, inst) && (!group || (u.group || '') === group)).map(clone));
  mock.method(dashboardRepo, 'distinctGroups', async (inst) =>
    [...new Set(world.users.filter((u) => isStudent(u, inst)).map((u) => u.group).filter(Boolean))]);
  mock.method(dashboardRepo, 'findStudent', async (inst, id) => clone(world.users.find((u) => same(u._id, id) && isStudent(u, inst))) || null);
  mock.method(dashboardRepo, 'interviewsFor', async (inst, ids) => db.interviews.filter((i) => same(i.institutionId, inst) && inIds(ids, i.userId)).map(clone));
  mock.method(dashboardRepo, 'findInterview', async (inst, uid, id) =>
    clone(db.interviews.find((i) => same(i._id, id) && same(i.institutionId, inst) && same(i.userId, uid))) || null);
  mock.method(dashboardRepo, 'cvAnalysesFor', async (inst, ids) => db.cvs.filter((c) => same(c.institutionId, inst) && inIds(ids, c.userId)).map(clone));
  mock.method(dashboardRepo, 'attemptsFor', async (inst, ids) =>
    db.attempts.filter((a) => same(a.institutionId, inst) && inIds(ids, a.userId) && ['run', 'submit'].includes(a.runKind) && !a.assessmentSessionId).map(clone));

  const answer = (questionType, score, extra = {}) => ({
    questionId: newId(), question: `Q ${questionType}`, questionType, textResponse: `answer ${score}`,
    feedback: { score, source: 'ai', communicationClarity: 7, strengths: ['clear'], improvements: ['more depth'] }, ...extra,
  });

  // Seeding helpers. Every document carries the SECRET markers that must never reach a lecturer.
  db.addInterview = (user, { responses = [answer('behavioral', 70)], status = 'completed', daysAgo = 1, ...fields } = {}) => {
    const at = new Date(Date.now() - daysAgo * 86400000);
    const iv = {
      _id: newId(), institutionId: user.institutionId, userId: user._id, status, createdAt: at, completedAt: status === 'completed' ? at : null,
      jobDescription: 'Junior developer at Acme. Build APIs with Node.js.', resumeText: 'SECRET-CV-INTERVIEW',
      questions: responses.map((r) => ({ questionId: r.questionId, type: r.questionType, question: r.question, category: 'General', difficulty: 'easy', tests: [{ input: '1', expectedOutput: 'SECRET-HIDDEN-TEST' }] })),
      responses: responses.map((r) => ({ audioUrl: 'SECRET-AUDIO-URL', ...r })),
      overallFeedback: { score: 50, readinessLevel: 'Nearly Ready', feedback: { generalFeedback: 'ok', strengths: ['s'] } },
      ...fields,
    };
    db.interviews.push(iv);
    return iv;
  };
  db.answer = answer;
  db.addCv = (user, results, { daysAgo = 1, ...fields } = {}) => {
    const c = {
      _id: newId(), institutionId: user.institutionId, userId: user._id, createdAt: new Date(Date.now() - daysAgo * 86400000),
      resumeText: 'SECRET-CV-ANALYSIS', resumeHash: 'h', jobDescriptions: ['Graduate engineer role'],
      results: results.map((r) => ({ jobIndex: 0, jobTitle: 'Engineer', company: 'Acme', strengths: ['projects'], contentWeaknesses: ['vague'], structureWeaknesses: [], ...r })),
      ...fields,
    };
    db.cvs.push(c);
    return c;
  };
  db.result = (match, { aiAvailable = true, missing = [], matched = ['javascript'] } = {}) => ({
    matchPercentage: match, scoreBreakdown: { aiAvailable, aiScore: aiAvailable ? match / 100 : null, keywordScore: 0.5, model: 'test', aiError: aiAvailable ? null : 'SECRET-AI-ERROR', requiredSkills: [...matched, ...missing], matchedSkills: matched, missingSkills: missing },
  });
  db.addAttempt = (user, fields) => {
    const a = { _id: newId(), institutionId: user.institutionId, userId: user._id, runKind: 'submit', createdAt: new Date(), source: 'SECRET-SOURCE', ...fields };
    db.attempts.push(a);
    return a;
  };
  return db;
};
