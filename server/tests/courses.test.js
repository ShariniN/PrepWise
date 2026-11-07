// Courses, cohorts, enrolment, and who can see what.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS } from './helpers.js';
import app from '../app.js';

let w, adminA, lecA1, lecA2, lecB, stuA1, stuA2, stuB;
beforeEach(() => {
  w = makeWorld();
  w.install();
  adminA = w.addUser({ email: 'admin@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecA1 = w.addUser({ email: 'l1@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  stuA1 = w.addUser({ email: 's1@a.edu', role: 'student', institutionId: IDS.instA });
  stuA2 = w.addUser({ email: 's2@a.edu', role: 'student', institutionId: IDS.instA });
  stuB = w.addUser({ email: 's@b.edu', role: 'student', institutionId: IDS.instB });
});
afterEach(() => mock.restoreAll());
const as = (u) => ({ Cookie: w.cookie(u) });

const makeCourse = async (user, code = 'CS101') => {
  const res = await request(app).post('/api/courses').set(as(user)).send({ code, title: `Course ${code}` });
  assert.equal(res.status, 201, res.text);
  return res.body.course;
};
const makeCohort = async (user, courseId, name = 'Group 1') => {
  const res = await request(app).post(`/api/courses/${courseId}/cohorts`).set(as(user)).send({ name });
  assert.equal(res.status, 201, res.text);
  return res.body.cohort;
};

test('unauthenticated gets 401; students cannot create or read course details', async () => {
  assert.equal((await request(app).get('/api/courses/mine')).status, 401);
  assert.equal((await request(app).post('/api/courses').set(as(stuA1)).send({ code: 'X', title: 'Y' })).status, 403);
  const c = await makeCourse(lecA1);
  assert.equal((await request(app).get(`/api/courses/${c.id}`).set(as(stuA1))).status, 403);
  assert.equal((await request(app).get('/api/courses/mine').set(as(w.addUser({ email: 'co@a.edu', role: 'career_officer', institutionId: IDS.instA })))).status, 200);
});

test('lecturer creates a course, a cohort, and enrols students by email', async () => {
  const c = await makeCourse(lecA1);
  assert.equal(c.ownerId, lecA1._id);
  const h = await makeCohort(lecA1, c.id);
  const res = await request(app).post(`/api/courses/${c.id}/cohorts/${h.id}/enrol`).set(as(lecA1))
    .send({ emails: ['S1@a.edu', 's2@a.edu', 's1@a.edu', 'ghost@a.edu', 'l2@a.edu', 's@b.edu'] });
  assert.equal(res.status, 200, res.text);
  const by = Object.fromEntries(res.body.results.map((r) => [r.email, r.status]));
  assert.deepEqual(by, {
    's1@a.edu': 'enrolled', 's2@a.edu': 'enrolled', 'ghost@a.edu': 'not_found', 'l2@a.edu': 'not_a_student', 's@b.edu': 'not_found',
  });
  assert.equal(w.enrollments.some((e) => String(e.userId) === String(stuB._id)), false, 'a student of B is never enrolled');
  const again = await request(app).post(`/api/courses/${c.id}/cohorts/${h.id}/enrol`).set(as(lecA1)).send({ emails: ['s1@a.edu'] });
  assert.equal(again.body.results[0].status, 'already_enrolled');
});

test('course list shows student counts to staff and only own cohorts to students', async () => {
  const c = await makeCourse(lecA1);
  const g1 = await makeCohort(lecA1, c.id, 'Group 1');
  await makeCohort(lecA1, c.id, 'Group 2');
  await request(app).post(`/api/courses/${c.id}/cohorts/${g1.id}/enrol`).set(as(lecA1)).send({ emails: ['s1@a.edu', 's2@a.edu'] });

  const staff = await request(app).get('/api/courses/mine').set(as(lecA1));
  assert.equal(staff.body.courses.length, 1);
  assert.equal(staff.body.courses[0].studentCount, 2);
  assert.deepEqual(staff.body.courses[0].cohorts.map((x) => [x.name, x.studentCount]), [['Group 1', 2], ['Group 2', 0]]);

  const student = await request(app).get('/api/courses/mine').set(as(stuA1));
  assert.equal(student.status, 200);
  assert.deepEqual(student.body.courses[0].cohorts.map((x) => x.name), ['Group 1']);
  assert.equal(student.body.courses[0].studentCount, undefined);

  const none = await request(app).get('/api/courses/mine').set(as(w.addUser({ email: 'new@a.edu', institutionId: IDS.instA })));
  assert.deepEqual(none.body.courses, []);
});

test('a lecturer sees only courses they own or are assigned to', async () => {
  const c1 = await makeCourse(lecA1, 'CS101');
  await makeCourse(lecA2, 'CS102');
  const mine = await request(app).get('/api/courses/mine').set(as(lecA1));
  assert.deepEqual(mine.body.courses.map((c) => c.code), ['CS101']);
  assert.equal((await request(app).get(`/api/courses/${c1.id}`).set(as(lecA2))).status, 404);

  // the administrator assigns lecturer 2 to course 1
  const assign = await request(app).post(`/api/courses/${c1.id}/lecturers`).set(as(adminA)).send({ email: 'l2@a.edu' });
  assert.equal(assign.status, 200);
  assert.equal((await request(app).get(`/api/courses/${c1.id}`).set(as(lecA2))).status, 200);
  const both = await request(app).get('/api/courses/mine').set(as(lecA2));
  assert.deepEqual(both.body.courses.map((c) => c.code).sort(), ['CS101', 'CS102']);
  // lecturers cannot assign
  assert.equal((await request(app).post(`/api/courses/${c1.id}/lecturers`).set(as(lecA1)).send({ email: 'l2@a.edu' })).status, 403);
});

test('a lecturer of A cannot read, extend or enrol into a course of B', async () => {
  const cB = await makeCourse(lecB, 'B100');
  const hB = await makeCohort(lecB, cB.id);
  assert.equal((await request(app).get(`/api/courses/${cB.id}`).set(as(lecA1))).status, 404);
  assert.equal((await request(app).post(`/api/courses/${cB.id}/cohorts`).set(as(lecA1)).send({ name: 'Evil' })).status, 404);
  assert.equal((await request(app).post(`/api/courses/${cB.id}/cohorts/${hB.id}/enrol`).set(as(lecA1)).send({ emails: ['s1@a.edu'] })).status, 404);
  assert.equal((await request(app).get(`/api/courses/${cB.id}/cohorts/${hB.id}/students`).set(as(lecA1))).status, 404);
  // even the administrator of A
  assert.equal((await request(app).get(`/api/courses/${cB.id}`).set(as(adminA))).status, 404);
  const mine = await request(app).get('/api/courses/mine').set(as(lecA1));
  assert.deepEqual(mine.body.courses, []);
  assert.equal(w.enrollments.length, 0);
});

test('a cohort id from another course of the same institution is not accepted', async () => {
  const c1 = await makeCourse(lecA1, 'CS101');
  const c2 = await makeCourse(lecA1, 'CS102');
  const h2 = await makeCohort(lecA1, c2.id);
  const res = await request(app).post(`/api/courses/${c1.id}/cohorts/${h2.id}/enrol`).set(as(lecA1)).send({ emails: ['s1@a.edu'] });
  assert.equal(res.status, 404);
});

test('cohort roster is visible to the course lecturer and not to an unrelated lecturer', async () => {
  const c = await makeCourse(lecA1);
  const h = await makeCohort(lecA1, c.id);
  await request(app).post(`/api/courses/${c.id}/cohorts/${h.id}/enrol`).set(as(lecA1)).send({ emails: ['s1@a.edu'] });
  const ok = await request(app).get(`/api/courses/${c.id}/cohorts/${h.id}/students`).set(as(lecA1));
  assert.deepEqual(ok.body.students.map((s) => s.email), ['s1@a.edu']);
  assert.equal((await request(app).get(`/api/courses/${c.id}/cohorts/${h.id}/students`).set(as(lecA2))).status, 404);
});

test('bad ids and missing fields are rejected cleanly', async () => {
  assert.equal((await request(app).get('/api/courses/not-an-id').set(as(lecA1))).status, 404);
  assert.equal((await request(app).post('/api/courses').set(as(lecA1)).send({ code: 'X' })).status, 400);
  const c = await makeCourse(lecA1);
  assert.equal((await request(app).post(`/api/courses/${c.id}/cohorts`).set(as(lecA1)).send({})).status, 400);
  const h = await makeCohort(lecA1, c.id);
  assert.equal((await request(app).post(`/api/courses/${c.id}/cohorts/${h.id}/enrol`).set(as(lecA1)).send({ emails: [] })).status, 400);
});
