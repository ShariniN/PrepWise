// Live API smoke test against a freshly seeded local stack (`npm run dev:local -- --fresh`). Fake demo data only.
// Usage: node smoke.mjs            (API=http://localhost:4000 by default)
//   SANDBOX=1  also call Practice run/submit (uses code-runner credits when JDoodle is set up)
//   SKIP_AI=1  skip the mock interview checks (they make 2-3 AI calls; with no AI key they use the fallback path)
const BASE = process.env.API || 'http://localhost:4000';
const SANDBOX = process.env.SANDBOX === '1';
const SKIP_AI = process.env.SKIP_AI === '1';

// Fixed demo logins seeded by seed-demo.js (local demo data only).
const creds = {
  adminA: ['admin@email.com', 'admin@123'],
  lectA: ['lecturer@email.com', 'lecturer@123'],
  studentA: ['student@email.com', 'student@123'],
  adminB: ['admin@demo-b.test', 'admin@123'],
  studentB: ['student@demo-b.test', 'student@123'],
};

class Client {
  constructor(name) { this.name = name; this.cookie = ''; }
  async raw(method, path, { body, headers = {} } = {}) {
    const res = await fetch(BASE + path, { method, headers: { ...headers, ...(this.cookie ? { Cookie: this.cookie } : {}) }, body });
    for (const c of res.headers.getSetCookie?.() || []) if (c.startsWith('token=')) this.cookie = c.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, headers: res.headers };
  }
  req(method, path, body) {
    return this.raw(method, path, body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  }
  login([email, password]) { return this.req('POST', '/api/auth/login', { email, password }); }
}

const results = []; const fails = [];
const short = (x) => (typeof x === 'string' ? x : JSON.stringify(x) ?? String(x)).slice(0, 220);
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok }); if (!ok) fails.push(`${name}  ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
};
const stamp = Date.now().toString(36);

const adminA = new Client('adminA'), lectA = new Client('lectA'), stuA = new Client('stuA'), adminB = new Client('adminB'), stuB = new Client('stuB');
for (const [c, k] of [[adminA, 'adminA'], [lectA, 'lectA'], [stuA, 'studentA'], [adminB, 'adminB'], [stuB, 'studentB']]) {
  const r = await c.login(creds[k]); check(`login ${k} (${creds[k][0]})`, r.status === 200 && r.data.success, short(r.data));
}
let r = await stuA.req('GET', '/api/auth/is-auth'); check('is-auth returns role', r.data?.user?.role === 'student', short(r.data));
r = await new Client('x').login(['student@email.com', 'wrong']); check('wrong password is refused', r.status === 401);

// ---------------------------------------------------------------- admin: people, invites, groups
r = await adminA.req('GET', '/api/institution/usage'); check('admin usage', r.status === 200 && r.data.studentLimit === 60, short(r.data));
const remainingBefore = r.data.remaining;
r = await adminA.req('GET', '/api/institution/people?role=student'); check('admin people list', r.status === 200 && r.data.people?.length >= 40, short(r.data));
r = await adminA.req('POST', '/api/institution/people/invite', { email: `newkid-${stamp}@demo-a.test`, name: 'New Kid', role: 'student', group: 'Group 1' });
check('admin invites a student into a group', r.status === 201 && r.data.user?.group === 'Group 1', short(r.data));
const inviteLink = r.data.inviteLink; check('invite link returned outside production', !!inviteLink);
if (inviteLink) {
  const token = new URL(inviteLink).searchParams.get('token');
  const weak = await new Client('anon').req('POST', '/api/auth/accept-invite', { token, password: 'abcdef' });
  check('accept-invite refuses a weak password', weak.status === 400);
  const a = await new Client('anon').req('POST', '/api/auth/accept-invite', { token, password: 'Newpass1!', name: 'New Kid' });
  check('accept invite', a.status === 200 && a.data.success, short(a.data));
  const again = await new Client('x').req('POST', '/api/auth/accept-invite', { token, password: 'Newpass1!' });
  check('invite link is single use', again.status === 400);
}
// Cancel a pending invitation: deactivate the invited person, the link dies and the seat comes back.
r = await adminA.req('POST', '/api/institution/people/invite', { email: `cancel-${stamp}@demo-a.test`, role: 'student' });
const cancelId = r.data.user?.id; const cancelToken = r.data.inviteLink && new URL(r.data.inviteLink).searchParams.get('token');
r = await adminA.req('PATCH', `/api/institution/people/${cancelId}/deactivate`);
check('cancel a pending invitation (deactivate an invited user)', r.status === 200 && r.data.user?.status === 'deactivated', `${r.status} ${short(r.data)}`);
if (cancelToken) {
  const dead = await new Client('anon').req('POST', '/api/auth/accept-invite', { token: cancelToken, password: 'Newpass1!' });
  check('a cancelled invitation link no longer works', dead.status === 400 && dead.data.code === 'INVITE_INVALID', short(dead.data));
}
r = await adminA.req('GET', '/api/institution/usage');
check('cancelling frees the seat (only the accepted invite uses one)', r.data.remaining === remainingBefore - 1, `before ${remainingBefore} now ${r.data.remaining}`);

r = await adminA.req('POST', '/api/institution/people/invite', { email: 'x@evil.com', name: 'Bad', role: 'student' }); check('email domain enforced', r.status === 400 && r.data.code === 'DOMAIN_NOT_ALLOWED', short(r.data));
r = await adminA.req('POST', '/api/institution/people/import', { csv: `email,name,role,group\nimp1-${stamp}@demo-a.test,Imp One,student,Group 2\nstudent@email.com,Exists,student,\nnot-an-email,Bad,student,\n` });
const by = Object.fromEntries((r.data.results || []).map((x) => [x.line, x.status]));
check('csv import labels rows (invited / skipped existing / error)', r.status === 200 && by[2] === 'invited' && by[3] === 'skipped' && by[4] === 'error', short(r.data));

// Group editing
r = await adminA.req('GET', '/api/institution/people?search=student05@demo-a.test');
const s05 = r.data.people?.[0];
r = await adminA.req('PATCH', `/api/institution/people/${s05?.id}/group`, { group: `Smoke ${stamp}` });
check('admin edits a group', r.status === 200 && r.data.user?.group === `Smoke ${stamp}`, short(r.data));
r = await adminA.req('PATCH', `/api/institution/people/${s05?.id}/group`, { group: 'x'.repeat(61) }); check('group longer than 60 is refused', r.status === 400 && r.data.code === 'INVALID_GROUP');
r = await lectA.req('GET', `/api/lecturer/students?group=${encodeURIComponent(`Smoke ${stamp}`)}`);
check('lecturer group filter finds the re-grouped student', r.status === 200 && r.data.total === 1 && r.data.students[0].email === 'student05@demo-a.test', short(r.data));
await adminA.req('PATCH', `/api/institution/people/${s05?.id}/group`, { group: s05?.group || '' });

// ---------------------------------------------------------------- tenancy and roles
r = await adminB.req('GET', '/api/institution/people?search=student'); check('B admin cannot see A people', r.status === 200 && !/demo-a\.test|@email\.com/.test(r.text));
r = await stuA.req('GET', '/api/institution/people'); check('student blocked from manage-people', r.status === 403);
r = await stuA.req('GET', '/api/lecturer/overview'); check('student blocked from the lecturer API', r.status === 403);
r = await new Client('anon').req('GET', '/api/lecturer/overview'); check('lecturer API needs a login', r.status === 401);

// ---------------------------------------------------------------- lecturer dashboard API
r = await lectA.req('GET', '/api/lecturer/overview');
check('lecturer overview', r.status === 200 && r.data.totals?.students >= 40 && Array.isArray(r.data.groups), short(r.data));
check('overview lists Group 1 and Group 2', ['Group 1', 'Group 2'].every((g) => r.data.groups?.includes(g)), short(r.data.groups));
check('overview interview averages shown (>= 5 students)', typeof r.data.interview?.overall?.average === 'number', short(r.data.interview));
check('overview top missing skills shown with enough students', r.data.cv?.topMissingSkillsInsufficientData === false && Array.isArray(r.data.cv?.topMissingSkills), short(r.data.cv));
r = await lectA.req('GET', '/api/lecturer/overview?group=Group%201'); check('overview filtered by group', r.status === 200 && r.data.group === 'Group 1' && r.data.totals.students >= 20, short(r.data.totals));
r = await lectA.req('GET', '/api/lecturer/students?group=Group%202&pageSize=100');
check('students list with group filter', r.status === 200 && r.data.total >= 20 && r.data.students.every((s) => s.group === 'Group 2'), short(r.data));
r = await lectA.req('GET', '/api/lecturer/students?sort=-avgInterviewScore&pageSize=5');
check('students list sorts by score', r.status === 200 && r.data.students.length === 5 && r.data.sort === '-avgInterviewScore', short(r.data));
const withInterview = r.data.students?.find((s) => s.interviewsCompleted > 0);
r = await lectA.req('GET', '/api/lecturer/students?sort=bogus'); check('unknown sort key is a 400', r.status === 400);
if (withInterview) {
  const prof = await lectA.req('GET', `/api/lecturer/students/${withInterview.id}`);
  check('student profile', prof.status === 200 && prof.data.student?.id === withInterview.id && Array.isArray(prof.data.interviews), short(prof.data));
  check('student profile never contains CV text or secrets', !/resumeText|currentCV|password|inviteToken|Otp|audioUrl/.test(prof.text));
  const iv = prof.data.interviews?.find((x) => x.status === 'completed');
  const det = iv && await lectA.req('GET', `/api/lecturer/students/${withInterview.id}/interviews/${iv.id}`);
  check('interview detail', det?.status === 200 && Array.isArray(det.data.interview?.questions), det ? short(det.data) : 'no completed interview');
  const otherB = await adminB.req('GET', `/api/lecturer/students/${withInterview.id}`); check('B cannot open an A student (404)', otherB.status === 404);
} else check('a student with a completed interview exists', false, 'none in the first page');
r = await lectA.raw('GET', '/api/lecturer/students.csv?group=Group%201');
check('students CSV export', r.status === 200 && /text\/csv/.test(r.headers.get('content-type') || '') && r.text.startsWith('name,email,group,last_active'), `${r.status} ${short(r.text)}`);
const groupOne = (await lectA.req('GET', '/api/lecturer/students?group=Group%201&pageSize=100')).data.total;
check('CSV has one row per student of the group (+ header)', r.text.trim().split(/\r?\n/).length === groupOne + 1, `${r.text.trim().split(/\r?\n/).length} lines, ${groupOne} students`);

// ---------------------------------------------------------------- removed features answer 404
for (const [c, path] of [
  [lectA, '/api/courses/mine'], [lectA, '/api/assessments'], [lectA, '/api/integrity/cases'], [stuA, '/api/integrity/my/cases'],
  [lectA, '/api/analytics/lecturer/topic-heatmap'], [adminA, '/api/analytics/careers/readiness'], [stuA, '/api/user/freshers'],
  [stuA, '/api/swot/assessments'], [lectA, '/api/questions'], [lectA, '/api/grading/queue'], [stuA, '/api/user/skills-assessments'],
]) {
  const x = await c.req('GET', path); check(`removed route ${path} is 404`, x.status === 404, String(x.status));
}
r = await lectA.req('GET', '/api/no-such-thing'); check('unknown API path is JSON 404', r.status === 404 && r.data?.success === false);

// ---------------------------------------------------------------- practice
r = await stuA.req('GET', '/api/practice/questions?type=coding'); const qs = r.data.questions || []; check('practice list', r.status === 200 && qs.length > 0, short(r.data));
const qid = qs[0]?.id || qs[0]?._id;
r = await stuA.req('GET', `/api/practice/questions/${qid}`);
check('question detail', r.status === 200); check('no reference or wrong solution leaked', !/referenceSolution|wrongSolution/.test(r.text));
check('no hidden test data leaked', !(r.data.question?.tests || []).some?.((t) => t.visible === false && (t.input != null || t.expectedOutput != null)));
if (SANDBOX) {
  r = await stuA.req('POST', `/api/practice/questions/${qid}/run`, { language: 'python', source: 'print(1)' });
  check('run gives a real verdict, or 503 with a reason (never fake success)', (r.status === 503 && !!r.data.reason && /Nothing was scored/.test(r.data.message)) || (r.status === 200 && r.data.verdict), `${r.status} ${short(r.data)}`);
  r = await stuA.req('POST', `/api/practice/questions/${qid}/submit`, { language: 'python', source: 'print(1)' });
  check('submit gives a graded result, or 503 with no score', (r.status === 503 && r.data.score === undefined) || (r.status === 200 && typeof r.data.score === 'number'), `${r.status}`);
} else console.log('SKIP  practice run/submit (set SANDBOX=1)');
r = await stuA.req('GET', '/api/practice/questions?type=mcq'); const mcq = (r.data.questions || [])[0];
if (mcq) { const s = await stuA.req('POST', `/api/practice/questions/${mcq.id || mcq._id}/submit`, { selected: [0] }); check('mcq submit is graded on the server', s.status === 200 && typeof s.data.score === 'number', `${s.status} ${short(s.data)}`); }

// ---------------------------------------------------------------- authoring and grading are gone
r = await lectA.req('POST', '/api/questions', { title: `Sum two numbers ${stamp}`, type: 'coding' }); check('lecturer question authoring is 404', r.status === 404, String(r.status));
r = await lectA.req('POST', '/api/questions/x/validate', {}); check('question validation is 404', r.status === 404, String(r.status));
r = await lectA.req('POST', '/api/questions/draft', {}); check('AI question drafting is 404', r.status === 404, String(r.status));
r = await stuA.req('POST', '/api/practice/x/events', { events: [] }); check('edit-event tracking is 404', r.status === 404, String(r.status));
r = await adminA.req('GET', '/api/analytics/admin/overview'); check('admin overview', r.status === 200, `${r.status}`);
r = await adminA.req('GET', '/api/analytics/admin/evidence'); check('admin evidence', r.status === 200, `${r.status}`);

// ---------------------------------------------------------------- profile settings
r = await stuA.req('PUT', '/api/user/profile', { name: 'Amara Adams', phoneNumber: 'abc' }); check('profile refuses a bad phone with 400', r.status === 400 && /10 to 15 digits/.test(r.data.message), short(r.data));
r = await stuA.req('PUT', '/api/user/profile', { name: 'Amara Adams' }); check('profile name-only update works', r.status === 200, short(r.data));
r = await stuA.req('PUT', '/api/user/change-password', { currentPassword: 'student@123', newPassword: 'abcdef' }); check('change password refuses a weak password', r.status === 400);
{
  const fd = new FormData(); fd.append('cv', new Blob(['plain text, not a PDF'], { type: 'application/pdf' }), 'x.pdf');
  const up = await stuA.raw('PUT', '/api/user/upload-cv', { body: fd });
  check('CV upload of a non-PDF is a 400', up.status === 400 && /Only PDF files are accepted/.test(up.data.message), `${up.status} ${short(up.data)}`);
}

// ---------------------------------------------------------------- mock interview, no camera, delivery metrics stored
if (!SKIP_AI) {
  const cv = 'Amara Adams. BSc Computer Science student. Projects: a REST API in Node.js and Express with MongoDB, tested with Jest; a React timetable app used by 200 students. Skills: JavaScript, Node.js, MongoDB, Git, SQL.';
  const jd = 'Junior backend developer (intern). Build REST APIs with Node.js and MongoDB, write tests, use Git, work in a small team.';
  const c = await stuA.req('POST', '/api/interviews/create', { jobDescription: jd, resumeText: cv });
  const iv = c.data.interview;
  check('create a mock interview', c.status === 201 && iv?.questions?.length > 0, `${c.status} ${short(c.data)}`);
  check('interview says whether generic fallback questions were used', typeof c.data.usedFallbackQuestions === 'boolean', short(c.data.usedFallbackQuestions));
  if (iv) {
    await stuA.req('PUT', `/api/interviews/${iv.id}/start`);
    const q1 = iv.questions[0];
    const metrics = { cameraUsed: false, faceVisiblePct: 99, eyeContactPct: 99, lookAwayCount: 1, headMovement: 'low', wordsPerMinute: 124, fillerWordCount: 3, durationSec: 41 };
    const a = await stuA.req('POST', `/api/interviews/${iv.id}/submit-answer`, {
      questionId: q1.questionId, responseText: 'I built a REST API in Node.js with Express and MongoDB for a society timetable. I wrote Jest tests for each route and used Git branches with reviews.',
      answerMode: 'text', responseTime: 60, deliveryMetrics: metrics,
    });
    check('camera-free answer is accepted', a.status === 200 && ['ai', 'fallback'].includes(a.data.feedback?.source), `${a.status} ${short(a.data)}`);
    check('camera values are dropped when the camera was off', a.data.deliveryMetrics?.cameraUsed === false && a.data.deliveryMetrics?.eyeContactPct === null && a.data.deliveryMetrics?.wordsPerMinute === 124, short(a.data.deliveryMetrics));
    const g = await stuA.req('GET', `/api/interviews/${iv.id}`);
    const stored = g.data.interview?.responses?.[0]?.deliveryMetrics;
    check('deliveryMetrics stored on the interview', stored?.cameraUsed === false && stored?.fillerWordCount === 3 && stored?.durationSec === 41, short(stored));
    const fb = await stuA.req('GET', `/api/interviews/${iv.id}/feedback`);
    check('feedback reports excluded fallback answers', fb.status === 200 && typeof fb.data.feedback?.excludedFallbackAnswers === 'number', short(fb.data.feedback));
  }
} else console.log('SKIP  mock interview (SKIP_AI=1)');

// ---------------------------------------------------------------- compliance
r = await stuA.req('GET', '/api/me/export'); check('student data export', r.status === 200 && r.text.includes('student@email.com'), String(r.status));
r = await new Client('anon').req('GET', '/api/compliance/subprocessors'); check('subprocessors are public', r.status === 200);
r = await stuB.req('GET', '/api/practice/questions'); check('B student can read the global seed bank', r.status === 200 && (r.data.questions || []).length > 0);

// ---------------------------------------------------------------- Task 5: self-signup and email verification
{
  const email = `new.student.${stamp}@email.com`;
  const anon = new Client('signup');
  const bad = await anon.req('POST', '/api/auth/signup', { name: 'Nobody', email: `x.${stamp}@not-a-university.test`, password: 'Newpass1!' });
  check('signup with an unknown domain is refused', bad.status === 400 && bad.data.code === 'SIGNUP_DOMAIN_NOT_ALLOWED', short(bad.data));
  const su = await anon.req('POST', '/api/auth/signup', { name: 'New Student', email, password: 'Newpass1!' });
  const link = su.data.devVerificationLink;
  check('signup answers 200 with a dev verification link', su.status === 200 && su.data.success && !!link, short(su.data));
  const early = await new Client('early').login([email, 'Newpass1!']);
  check('login before verifying is 403 EMAIL_NOT_VERIFIED', early.status === 403 && early.data.code === 'EMAIL_NOT_VERIFIED', short(early.data));
  const token = link && new URL(link).searchParams.get('token');
  const v = await anon.req('POST', '/api/auth/verify-email', { token });
  check('verify-email activates the student and signs them in', v.status === 200 && v.data.success && v.data.role === 'student' && v.data.isAccountVerified === true, short(v.data));
  const me = await anon.req('GET', '/api/auth/is-auth');
  check('verified student is signed in', me.data?.user?.email === email && me.data.user.status === 'active', short(me.data));
  check('a new student needs onboarding', me.data?.needsOnboarding === true || me.data?.user?.needsOnboarding === true, short(me.data));
  const again = await new Client('again').req('POST', '/api/auth/verify-email', { token });
  check('verification link works once', again.status === 400 && again.data.code === 'VERIFY_INVALID', short(again.data));
  const dup = await new Client('dup').req('POST', '/api/auth/signup', { name: 'New Student', email, password: 'Newpass1!' });
  check('signup for an existing email gives the same answer, no link', dup.status === 200 && dup.data.message === su.data.message && !dup.data.devVerificationLink, short(dup.data));
  const oldOtp = await anon.req('POST', '/api/auth/send-verify-otp');
  check('old email-code route is gone', oldOtp.status === 404, String(oldOtp.status));
}

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }
