// Review queue: tenancy, lecturer scoping, audit trail, student visibility, retention.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { purgeExpiredEvidence } from '../services/integrity/retention.js';
import app from '../app.js';

const DAY = 86400e3;
let w, db, lecA, lecA2, admA, lecB, admB, stu, stu2, stuB, courseA, cohortA, courseB, qMcq, assessment, session, kase;
beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  lecA = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  admA = w.addUser({ email: 'ad@a.edu', role: 'university_admin', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  admB = w.addUser({ email: 'ad@b.edu', role: 'university_admin', institutionId: IDS.instB });
  stu = w.addUser({ email: 's1@a.edu', institutionId: IDS.instA });
  stu2 = w.addUser({ email: 's2@a.edu', institutionId: IDS.instA });
  stuB = w.addUser({ email: 's@b.edu', institutionId: IDS.instB });
  courseA = { _id: newId(), institutionId: IDS.instA, code: 'CS1', title: 'CS1', ownerId: lecA._id };
  courseB = { _id: newId(), institutionId: IDS.instB, code: 'CS1', title: 'CS1', ownerId: lecB._id };
  cohortA = { _id: newId(), institutionId: IDS.instA, courseId: courseA._id, name: '2026' };
  w.courses.push(courseA, courseB); w.cohorts.push(cohortA);
  qMcq = db.addQuestion({ institutionId: IDS.instA, type: 'mcq', title: 'Pick', options: ['a', 'b'], correct: [1] });
  assessment = w.adb.addAssessment({ institutionId: IDS.instA, courseId: courseA._id, cohortId: cohortA._id, createdBy: lecA._id, questionIds: [qMcq._id], title: 'Midterm' });
  session = {
    _id: newId(), institutionId: IDS.instA, assessmentId: assessment._id, courseId: courseA._id, userId: stu._id, attemptNo: 1, status: 'submitted',
    serverStartedAt: new Date(Date.now() - 3600e3), baseDeadline: new Date(Date.now() + 1000), extensionMs: 0, closesAt: assessment.closesAt, questions: [{ questionId: qMcq._id }],
    submittedAt: new Date(), integrityLevel: 1, disabledSignals: [],
  };
  w.adb.sessions.push(session);
  w.adb.events.push({ _id: newId(), institutionId: IDS.instA, sessionId: session._id, type: 'tab_hidden', t: 1000, technical: false, createdAt: new Date() });
  kase = {
    _id: newId(), institutionId: IDS.instA, assessmentId: assessment._id, courseId: courseA._id, sessionId: session._id, userId: stu._id, status: 'open',
    reasons: [{ code: 'left_page', kind: 'behaviour', text: 'left the page 6 times for a total of 4m12s', measured: { count: 6 }, threshold: { leftPageCount: 5 }, evidence: [{ kind: 'integrity_event', id: 'x', at: 1 }] }],
    technical: {}, notes: 'PRIVATE_NOTE', outcome: null, studentResponse: null, history: [], createdAt: new Date(), updatedAt: new Date(),
  };
  w.adb.cases.push(kase);
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

const as = (u) => ({ Cookie: w.cookie(u) });
const api = (u) => ({
  get: (p) => request(app).get(`/api/integrity${p}`).set(as(u)),
  post: (p, b) => request(app).post(`/api/integrity${p}`).set(as(u)).send(b),
  patch: (p, b) => request(app).patch(`/api/integrity${p}`).set(as(u)).send(b),
});
const auditFor = (action) => w.audit.filter((x) => x.action === action);

test('authentication and roles: students never use the staff endpoints', async () => {
  assert.equal((await request(app).get('/api/integrity/cases')).status, 401);
  for (const [m, p] of [['get', '/cases'], ['get', `/cases/${kase._id}`], ['patch', `/cases/${kase._id}`], ['post', `/sessions/${session._id}/analyse`], ['post', `/assessments/${assessment._id}/analyse`]]) {
    assert.equal((await api(stu)[m](p, {})).status, 403, `${m} ${p}`);
  }
  assert.equal((await api(lecA).get('/my/cases')).status, 403);
});

test('tenant isolation: another university sees and changes nothing', async () => {
  for (const u of [lecB, admB]) {
    assert.deepEqual((await api(u).get('/cases')).body.cases, []);
    assert.equal((await api(u).get(`/cases/${kase._id}`)).status, 404);
    assert.equal((await api(u).patch(`/cases/${kase._id}`, { status: 'dismissed' })).status, 404);
    assert.equal((await api(u).post(`/sessions/${session._id}/analyse`, {})).status, 404);
    assert.equal((await api(u).post(`/assessments/${assessment._id}/analyse`, {})).status, 404);
  }
  assert.equal((await api(stuB).get(`/my/cases/${kase._id}`)).status, 404);
  assert.equal(kase.status, 'open');
  assert.equal(auditFor('integrity.view').length, 0);
});

test('lecturers only see cases of their own courses; admins see the whole university', async () => {
  assert.equal((await api(lecA).get('/cases')).body.cases.length, 1);
  assert.deepEqual((await api(lecA2).get('/cases')).body.cases, []);
  assert.equal((await api(lecA2).get(`/cases/${kase._id}`)).status, 404);
  assert.equal((await api(lecA2).patch(`/cases/${kase._id}`, { status: 'dismissed' })).status, 404);
  assert.equal((await api(admA).get('/cases')).body.cases.length, 1);
  assert.equal((await api(admA).get(`/cases/${kase._id}`)).status, 200);
  w.enrollments.push({ institutionId: IDS.instA, userId: lecA2._id, kind: 'lecturer', courseId: courseA._id, cohortId: null });
  assert.equal((await api(lecA2).get(`/cases/${kase._id}`)).status, 200);
});

test('list filters: status, assessment, course, student', async () => {
  const other = { ...structuredClone(kase), _id: newId(), status: 'dismissed', userId: stu2._id, sessionId: newId() };
  w.adb.cases.push(other);
  const ids = async (q) => (await api(lecA).get(`/cases${q}`)).body.cases.map((c) => c.id).sort();
  assert.equal((await ids('')).length, 2);
  assert.deepEqual(await ids('?status=open'), [String(kase._id)]);
  assert.deepEqual(await ids('?status=open,dismissed'), [String(kase._id), String(other._id)].sort());
  assert.deepEqual(await ids(`?userId=${stu2._id}`), [String(other._id)]);
  assert.equal((await ids(`?assessmentId=${assessment._id}`)).length, 2);
  assert.equal((await ids(`?courseId=${courseA._id}`)).length, 2);
  assert.deepEqual(await ids(`?courseId=${courseB._id}`), []);
  assert.deepEqual(await ids(`?assessmentId=${newId()}`), []);
  assert.equal((await api(lecA).get('/cases?status=bogus')).status, 400);
  const first = (await api(lecA).get('/cases?status=open')).body.cases[0];
  assert.equal(first.studentEmail, 's1@a.edu');
  assert.equal(first.assessmentTitle, 'Midterm');
  assert.deepEqual(first.reasonCodes, ['left_page']);
});

test('viewing a case returns reasons, evidence and the timeline, and writes an audit entry', async () => {
  const r = await api(lecA).get(`/cases/${kase._id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.case.reasons[0].evidence.length, 1);
  assert.equal(r.body.case.notes, 'PRIVATE_NOTE');
  assert.ok(r.body.timeline.items.some((i) => i.kind === 'integrity' && i.type === 'tab_hidden'));
  const entries = auditFor('integrity.view');
  assert.equal(entries.length, 1);
  assert.equal(String(entries[0].actor), String(lecA._id));
  assert.equal(String(entries[0].target), String(kase._id));
  assert.equal(String(entries[0].institutionId), IDS.instA);
  assert.equal(entries[0].meta.studentId, String(stu._id));
  await api(lecA).get(`/cases/${kase._id}`);
  assert.equal(auditFor('integrity.view').length, 2, 'every view is recorded');
});

test('status, outcome and notes: allowed moves, required outcome, reopen, audit, and no score-like field', async () => {
  const patch = (b) => api(lecA).patch(`/cases/${kase._id}`, b);
  assert.equal((await patch({})).status, 400);
  assert.equal((await patch({ status: 'banned' })).status, 400);
  assert.equal((await patch({ outcome: 'expelled' })).status, 400);
  assert.equal((await patch({ status: 'resolved' })).status, 400); // needs an outcome
  assert.equal((await patch({ notes: 'x'.repeat(4001) })).status, 400);
  const esc = await patch({ status: 'escalated', notes: 'Talked to the module lead' });
  assert.equal(esc.status, 200);
  assert.equal(esc.body.case.status, 'escalated');
  assert.equal(String(esc.body.case.reviewerId), String(lecA._id));
  assert.equal((await patch({ status: 'open' })).status, 409);
  const done = await patch({ status: 'resolved', outcome: 'informal_warning' });
  assert.equal(done.body.case.outcome, 'informal_warning');
  const reopened = await patch({ status: 'open' });
  assert.equal(reopened.body.case.outcome, null);
  const dismissed = await patch({ status: 'dismissed' });
  assert.equal(dismissed.body.case.outcome, 'no_action');
  assert.equal(auditFor('integrity.update').length, 4);
  assert.deepEqual(kase.history.map((h) => h.to), ['escalated', 'resolved', 'open', 'dismissed']);
  const text = JSON.stringify(dismissed.body);
  assert.ok(!/score|penalt|deduct|grade|mark\b/i.test(text), text);
  // marks are untouched
  assert.equal(w.qdb.attempts.length, 0);
});

test('re-analysing is audited and tenant-scoped', async () => {
  const r = await api(lecA).post(`/sessions/${session._id}/analyse`, {});
  assert.equal(r.status, 200);
  assert.equal(auditFor('integrity.analyse').length, 1);
  const all = await api(lecA).post(`/assessments/${assessment._id}/analyse`, {});
  assert.equal(all.body.sessions, 1);
  assert.equal((await api(lecA2).post(`/sessions/${session._id}/analyse`, {})).status, 404);
});

test('students only see their own ESCALATED cases, without evidence or reviewer notes, and can respond', async () => {
  assert.deepEqual((await api(stu).get('/my/cases')).body.cases, []); // open: invisible
  assert.equal((await api(stu).get(`/my/cases/${kase._id}`)).status, 404);
  assert.equal((await api(stu).post(`/my/cases/${kase._id}/response`, { text: 'hello' })).status, 404);
  await api(lecA).patch(`/cases/${kase._id}`, { status: 'escalated' });
  const mine = await api(stu).get('/my/cases');
  assert.equal(mine.body.cases.length, 1);
  assert.equal(mine.body.cases[0].assessmentTitle, 'Midterm');
  assert.equal(mine.body.cases[0].reasons[0].text, 'left the page 6 times for a total of 4m12s');
  const dump = JSON.stringify(mine.body);
  assert.ok(!dump.includes('PRIVATE_NOTE') && !dump.includes('evidence') && !dump.includes('"measured"'), dump);
  assert.deepEqual((await api(stu2).get('/my/cases')).body.cases, []);
  assert.equal((await api(stu2).get(`/my/cases/${kase._id}`)).status, 404);
  assert.equal((await api(stu2).post(`/my/cases/${kase._id}/response`, { text: 'not mine' })).status, 404);
  assert.equal((await api(stu).post(`/my/cases/${kase._id}/response`, { text: '   ' })).status, 400);
  const resp = await api(stu).post(`/my/cases/${kase._id}/response`, { text: 'I was checking the lecture notes for syntax.' });
  assert.equal(resp.status, 201);
  assert.equal(kase.studentResponse.text, 'I was checking the lecture notes for syntax.');
  assert.equal(auditFor('integrity.student_response').length, 1);
  const seen = await api(lecA).get(`/cases/${kase._id}`);
  assert.equal(seen.body.case.studentResponse.text, 'I was checking the lecture notes for syntax.');
  assert.equal(seen.body.case.hasStudentResponse, true);
  await api(lecA).patch(`/cases/${kase._id}`, { status: 'dismissed' });
  assert.deepEqual((await api(stu).get('/my/cases')).body.cases, []);
});

test('students cannot read integrity data through any other endpoint', async () => {
  for (const p of [`/cases/${kase._id}`, '/cases', `/sessions/${session._id}/replay?questionId=${qMcq._id}`, `/assessments/${assessment._id}/similarity`]) {
    assert.equal((await api(stu).get(p)).status, 403, p);
  }
  const t = await request(app).get(`/api/assessments/${assessment._id}/sessions`).set(as(stu));
  assert.equal(t.status, 403);
});

// ---------------------------------------------------------------- retention
test('purge deletes evidence older than each university\'s own retention and keeps open / escalated investigations', async () => {
  const now = new Date('2026-06-01T00:00:00Z');
  w.institutions[IDS.instA].retentionDays = 30;
  w.institutions[IDS.instB].retentionDays = 365;
  const old = new Date(now.getTime() - 45 * DAY);
  const fresh = new Date(now.getTime() - 5 * DAY);
  const sessB = newId();
  const ev = (inst, sessionId, createdAt) => ({ _id: newId(), institutionId: inst, sessionId, type: 'paste', t: 1, createdAt });
  const protectedSession = newId();
  w.adb.events.length = 0;
  w.adb.events.push(ev(IDS.instA, session._id, old), ev(IDS.instA, session._id, fresh), ev(IDS.instB, sessB, old), ev(IDS.instA, protectedSession, old));
  w.adb.cases.push({ _id: newId(), institutionId: IDS.instA, sessionId: protectedSession, courseId: courseA._id, assessmentId: assessment._id, userId: stu._id, status: 'escalated', updatedAt: old });
  w.adb.cases.push({ _id: newId(), institutionId: IDS.instA, sessionId: newId(), courseId: courseA._id, assessmentId: assessment._id, userId: stu2._id, status: 'resolved', updatedAt: old });
  w.adb.cases.push({ _id: newId(), institutionId: IDS.instA, sessionId: newId(), courseId: courseA._id, assessmentId: assessment._id, userId: stu2._id, status: 'dismissed', updatedAt: fresh });
  w.qdb.batches.push({ _id: newId(), institutionId: IDS.instA, assessmentSessionId: session._id, createdAt: old, events: [] });
  w.qdb.batches.push({ _id: newId(), institutionId: IDS.instA, assessmentSessionId: null, createdAt: old, events: [] }); // practice, not in scope
  w.adb.pairs.push({ _id: newId(), institutionId: IDS.instA, sessionAId: session._id, sessionBId: newId(), createdAt: old });
  kase.updatedAt = fresh; kase.status = 'dismissed'; // closed and recent: session evidence is not protected

  const rows = await purgeExpiredEvidence(now);
  const a = rows.find((r) => r.institutionId === IDS.instA);
  assert.equal(a.retentionDays, 30);
  assert.equal(a.integrityEvents, 1);
  assert.equal(a.editEventBatches, 1);
  assert.equal(a.similarityPairs, 1);
  assert.equal(a.closedCases, 1);
  assert.equal(rows.find((r) => r.institutionId === IDS.instB).integrityEvents, 0, 'university B keeps 365 days');
  const left = w.adb.events.map((e) => `${e.institutionId === IDS.instA ? 'A' : 'B'}:${String(e.sessionId) === String(protectedSession) ? 'protected' : e.createdAt === fresh ? 'fresh' : 'old'}`).sort();
  assert.deepEqual(left, ['A:fresh', 'A:protected', 'B:old']);
  assert.ok(w.qdb.batches.some((b) => b.assessmentSessionId === null), 'practice edit events are untouched');
  assert.equal(w.adb.cases.filter((c) => c.status === 'escalated').length, 1);
  assert.equal(w.adb.cases.filter((c) => c.status === 'resolved').length, 0);
  assert.equal(auditFor('integrity.purge').length, 1);
  assert.equal(String(auditFor('integrity.purge')[0].institutionId), IDS.instA);
});

test('purge is idempotent', async () => {
  const now = new Date('2026-06-01T00:00:00Z');
  w.adb.events[0].createdAt = new Date(now.getTime() - 400 * DAY);
  kase.status = 'dismissed'; kase.updatedAt = new Date(now.getTime() - 400 * DAY);
  const first = await purgeExpiredEvidence(now);
  assert.equal(first.find((r) => r.institutionId === IDS.instA).integrityEvents, 1);
  const second = await purgeExpiredEvidence(now);
  assert.ok(second.every((r) => r.integrityEvents === 0 && r.closedCases === 0));
});
