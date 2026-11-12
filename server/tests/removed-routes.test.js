// Courses, assessments, integrity review, the old course-scoped / career-officer analytics and unused student routes were removed.
// Their URLs must answer a JSON 404 to a logged-in user. The whole /api/analytics module is gone too.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import app from '../app.js';

let w, admin, lecturer, student;
beforeEach(() => {
  w = makeWorld();
  w.install();
  admin = w.addUser({ email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecturer = w.addUser({ email: 'lec@a.edu', role: 'lecturer', institutionId: IDS.instA });
  student = w.addUser({ email: 'stu@a.edu', role: 'student', institutionId: IDS.instA });
});
afterEach(() => mock.restoreAll());

const id = '0123456789abcdef01234567';
export const REMOVED = [
  // courses
  ['get', '/api/courses/mine'], ['post', '/api/courses'], ['get', `/api/courses/${id}`], ['post', `/api/courses/${id}/cohorts`],
  ['post', `/api/courses/${id}/cohorts/${id}/enrol`], ['get', `/api/courses/${id}/cohorts/${id}/students`], ['post', `/api/courses/${id}/lecturers`],
  // assessments
  ['get', '/api/assessments'], ['post', '/api/assessments'], ['get', `/api/assessments/${id}`], ['put', `/api/assessments/${id}`],
  ['patch', `/api/assessments/${id}/status`], ['post', `/api/assessments/${id}/start`], ['get', `/api/assessments/${id}/sessions`],
  ['put', `/api/assessments/${id}/accommodations/${id}`], ['delete', `/api/assessments/${id}/accommodations/${id}`],
  ['post', `/api/assessments/${id}/sessions/${id}/extend`], ['get', `/api/assessments/sessions/${id}`],
  ['get', `/api/assessments/sessions/${id}/results`], ['get', `/api/assessments/sessions/${id}/questions/${id}`],
  ['post', `/api/assessments/sessions/${id}/questions/${id}/run`], ['post', `/api/assessments/sessions/${id}/questions/${id}/submit`],
  ['put', `/api/assessments/sessions/${id}/questions/${id}/autosave`], ['post', `/api/assessments/sessions/${id}/questions/${id}/events`],
  ['post', `/api/assessments/sessions/${id}/integrity-events`], ['post', `/api/assessments/sessions/${id}/finish`],
  // integrity
  ['get', '/api/integrity/my/cases'], ['get', `/api/integrity/my/cases/${id}`], ['post', `/api/integrity/my/cases/${id}/response`],
  ['get', '/api/integrity/cases'], ['get', `/api/integrity/cases/${id}`], ['patch', `/api/integrity/cases/${id}`],
  ['post', `/api/integrity/sessions/${id}/analyse`], ['post', `/api/integrity/assessments/${id}/analyse`],
  ['post', `/api/integrity/assessments/${id}/similarity/run`], ['get', `/api/integrity/assessments/${id}/similarity`],
  ['get', `/api/integrity/sessions/${id}/replay`],
  // old analytics
  ['get', '/api/analytics/lecturer/failure-patterns'], ['get', '/api/analytics/lecturer/topic-heatmap'],
  ['get', '/api/analytics/lecturer/students-needing-help'], ['get', '/api/analytics/lecturer/question-quality'],
  ['get', '/api/analytics/lecturer/activity'], ['get', '/api/analytics/careers/readiness'], ['get', '/api/analytics/careers/readiness.csv'],
  ['get', '/api/analytics/careers/coverage'], ['get', '/api/analytics/careers/skills-gap'],
  // unused duplicates and debug routes of the student features (the client never called them)
  ['get', '/api/user/skills-stats'], ['get', `/api/user/skills-assessment/${id}`],
  ['post', '/api/analyze/toggle-save'], ['post', '/api/analyze/analyze-profile-cv'],
  ['get', '/api/swot/health'], ['get', '/api/swot/test-auth'], ['get', '/api/swot/ratings'], ['get', '/api/swot/stats'],
  ['get', '/api/swot/ratings/abc'], ['delete', `/api/swot/delete/${id}`],
  ['post', '/api/interviews/execute'], ['get', '/api/interviews/user/history'],
  ['post', `/api/interviews/${id}/answer`], ['post', `/api/interviews/${id}/skip`],
  // lean refactor: skills self-assessment, lecturer question authoring, grading, edit-event tracking
  ['get', '/api/swot/assessments'], ['post', '/api/questions'], ['post', '/api/questions/x/validate'],
  ['post', '/api/questions/draft'], ['get', '/api/user/skills-assessments'], ['delete', `/api/user/assessment/${id}`],
  ['post', '/api/swot/save-ratings'], ['get', '/api/grading/queue'],
  // adaptive interviews: creation uses the CV on file, and the next question comes with each answer
  ['post', '/api/interviews/create-with-profile-cv'], ['get', `/api/interviews/${id}/next-question`], ['post', '/api/interviews/process-cv']
];

test('every removed endpoint returns a JSON 404 for every role', async () => {
  for (const user of [admin, lecturer, student]) {
    for (const [m, url] of REMOVED) {
      const res = await request(app)[m](url).set('Cookie', w.cookie(user)).send({});
      assert.equal(res.status, 404, `${user.role} ${m.toUpperCase()} ${url}`);
      assert.match(res.headers['content-type'], /application\/json/, url);
    }
  }
});

test('practice has no edit-event tracking and no assessment lock', async () => {
  const res = await request(app).post('/api/practice/attempts/x/events').set('Cookie', w.cookie(student)).send({ events: [] });
  assert.equal(res.status, 404);
  const res2 = await request(app).post('/api/practice/x/events').set('Cookie', w.cookie(student)).send({});
  assert.equal(res2.status, 404);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '..', 'modules', 'practice', 'practice.routes.js'), 'utf8');
  assert.doesNotMatch(src, /blockLocked|ASSESSMENT_IN_PROGRESS|events/);
});

test('practice submit refuses short answers', async () => {
  const db = installQuestionWorld(w);
  const sq = db.addQuestion({ institutionId: IDS.instA, type: 'short', title: 'Why?' });
  const res = await request(app).post(`/api/practice/questions/${sq._id}/submit`).set('Cookie', w.cookie(student)).send({ answer: 'Because.' });
  assert.equal(res.status, 400);
  assert.equal(db.attempts.length, 0);
  const dq = db.addQuestion({ institutionId: IDS.instA, type: 'debug', title: 'Find the bug' });
  const res2 = await request(app).post(`/api/practice/questions/${dq._id}/submit`).set('Cookie', w.cookie(student)).send({ language: 'javascript', source: 'x' });
  assert.equal(res2.status, 400);
  assert.equal(db.attempts.length, 0);
});

test('no source file imports a removed model, repository or service', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serverDir = path.join(here, '..');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', 'uploads', '.local-db'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
  const removed = /models\/(Course|Cohort|Enrollment|Assessment|AssessmentSession|IntegrityEvent|ReviewCase|SimilarityPair|Rubric|SkillsAssessment|EditEventBatch)\.js|repositories\/questionRepo|questionController|questionRoutes|questionDrafting|modules\/(skills|grading)\/|courseRepo|courseAccess|assessmentRepo|services\/(integrity|similarity|assessments)\/|careersController|purge-evidence/;
  const offenders = walk(serverDir).filter((f) => !f.endsWith('removed-routes.test.js') && removed.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
