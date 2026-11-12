// Live API smoke test against a freshly seeded local stack (`npm run dev:local -- --fresh`). Fake demo data only.
// Usage: node smoke.mjs            (API=http://localhost:4000 by default)
//   SANDBOX=1  also call Practice run/submit (uses code-runner credits when JDoodle is set up)
//   SKIP_AI=1  skip the mock interview checks (about 13 AI calls; with no AI key they use the fallback path)
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

// ---------------------------------------------------------------- Task 6: adaptive 5-question mock interview
// With no AI key the generic question pool and the basic scoring are used, so the level never moves. The coding slot
// is a seeded practice question; without a code runner its answer is recorded as not verified.
// A one-page text PDF, so the smoke can put a CV on file for a student that has none. It is padded past 4 KB with a
// comment line: the server's PDF reader refuses some very small uploads with "bad XRef entry".
const makePdf = (lines) => {
  const esc = (s) => s.replace(/[\\()]/g, (ch) => `\\${ch}`);
  const stream = `BT /F1 11 Tf 50 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = `%PDF-1.4\n%${'-'.repeat(6000)}\n`;
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([Buffer.from(out, 'latin1')], { type: 'application/pdf' });
};
if (!SKIP_AI) {
  const LEVELS = ['easy', 'medium', 'hard'];
  const create = (body = {}) => stuA.req('POST', '/api/interviews/create', body);
  let c = await create();
  if (c.data?.code === 'CV_REQUIRED') {
    check('interview without a CV on file is 409 CV_REQUIRED', c.status === 409, `${c.status} ${short(c.data)}`);
    const fd = new FormData();
    fd.append('cv', makePdf(['Amara Adams. BSc Computer Science student.', 'Projects: a REST API in Node.js and Express with MongoDB, tested with Jest.', 'Skills: JavaScript, Node.js, MongoDB, Git, SQL.']), 'amara-cv.pdf');
    const up = await stuA.raw('PUT', '/api/user/upload-cv', { body: fd });
    check('student uploads a CV', up.status === 200, `${up.status} ${short(up.data)}`);
    c = await create();
  }
  if (c.data?.code === 'TARGET_ROLE_REQUIRED') {
    check('interview without a target role is 409 TARGET_ROLE_REQUIRED', c.status === 409, `${c.status} ${short(c.data)}`);
    const roles = await stuA.req('GET', '/api/me/target-roles');
    const list = Array.isArray(roles.data) ? roles.data : (roles.data?.targetRoles || roles.data?.roles || []);
    const role = list[0];
    const set = role && await stuA.req('PUT', '/api/me/target-role', { targetRoleId: role.id || role._id });
    check('student picks a target role', set?.status === 200, `${roles.status} ${set?.status} ${short(set?.data ?? roles.data)}`);
    c = await create();
  }
  if (c.data?.code === 'READINESS_REQUIRED') {
    check('first interview without readiness is 400 READINESS_REQUIRED', c.status === 400, `${c.status} ${short(c.data)}`);
    c = await create({ readiness: 'some_practice' });
  }
  const iv = c.data?.interview;
  check('create a mock interview from the CV on file and the target role', c.status === 201 && iv?.questions?.length === 1 && iv.totalSlots === 5, `${c.status} ${short(c.data)}`);
  check('interview says whether generic fallback questions were used', typeof c.data?.usedFallbackQuestions === 'boolean', short(c.data?.usedFallbackQuestions));
  check('interview starts at a level', LEVELS.includes(iv?.startLevel) && iv?.questions?.[0]?.level === iv?.startLevel, short(iv?.startLevel));
  if (iv) {
    let g = await stuA.req('GET', `/api/interviews/${iv.id}`);
    check('GET has no pool and only the first question', g.status === 200 && !('pool' in (g.data.interview || {})) && g.data.interview?.questions?.length === 1, short(g.data.interview?.questions?.length));
    const metrics = { cameraUsed: false, faceVisiblePct: 99, eyeContactPct: 99, lookAwayCount: 1, headMovement: 'low', wordsPerMinute: 124, fillerWordCount: 3, durationSec: 41 };
    let q = iv.questions[0];
    const asked = [];
    let last;
    for (let n = 0; n < 5 && q; n++) {
      asked.push(q);
      const code = 'print(sum(map(int, input().split())))';
      const body = q.type === 'coding'
        ? { questionId: q.questionId, answerMode: 'code', responseText: code, code, language: 'python', responseTime: 60 }
        : { questionId: q.questionId, answerMode: 'text', responseTime: 60, deliveryMetrics: n === 0 ? metrics : undefined,
          responseText: 'I built a REST API in Node.js with Express and MongoDB for a society timetable. I wrote Jest tests for each route and used Git branches with reviews.' };
      last = await stuA.req('POST', `/api/interviews/${iv.id}/submit-answer`, body);
      if (n === 0) {
        check('camera-free answer is accepted', last.status === 200 && ['ai', 'fallback'].includes(last.data.feedback?.source), `${last.status} ${short(last.data)}`);
        check('camera values are dropped when the camera was off', last.data.deliveryMetrics?.cameraUsed === false && last.data.deliveryMetrics?.eyeContactPct === null && last.data.deliveryMetrics?.wordsPerMinute === 124, short(last.data.deliveryMetrics));
        const again = await stuA.req('POST', `/api/interviews/${iv.id}/submit-answer`, body);
        check('answering the same question twice is 409 ALREADY_ANSWERED', again.status === 409 && again.data.code === 'ALREADY_ANSWERED', `${again.status} ${short(again.data)}`);
      }
      if (last.status !== 200) break;
      q = last.data.nextQuestion;
    }
    check('five answers, each with a level', asked.length === 5 && asked.every((x, i) => x.slot === i && LEVELS.includes(x.level)) && last?.data?.done === true && last.data.nextQuestion === null, short(asked.map((x) => `${x.slot}:${x.type}:${x.level}`)));
    check('slots are behavioural, technical, coding, technical, behavioural', asked.map((x) => x.type).join() === 'behavioral,technical,coding,technical,behavioral', short(asked.map((x) => x.type)));
    const coding = asked[2];
    check('the coding slot is a seeded practice question with visible tests only', !!coding?.practiceQuestionId && coding.visibleTests?.length > 0 && !('tests' in coding), short(coding && { id: coding.practiceQuestionId, visible: coding.visibleTests?.length }));
    if (c.data.usedFallbackQuestions) {
      check('without the AI the level does not move', asked.every((x) => x.level === iv.startLevel), short(asked.map((x) => x.level)));
    }
    g = await stuA.req('GET', `/api/interviews/${iv.id}`);
    check('the last answer completes the interview with a level reached', g.data.interview?.status === 'completed' && LEVELS.includes(g.data.interview?.levelReached), short({ status: g.data.interview?.status, levelReached: g.data.interview?.levelReached }));
    check('GET has no pool after completion either', !('pool' in (g.data.interview || {})) && g.data.interview?.questions?.length === 5);
    const stored = g.data.interview?.responses?.[0]?.deliveryMetrics;
    check('deliveryMetrics stored on the interview', stored?.cameraUsed === false && stored?.fillerWordCount === 3 && stored?.durationSec === 41, short(stored));
    const fb = await stuA.req('GET', `/api/interviews/${iv.id}/feedback`);
    check('feedback reports excluded fallback answers and the levels', fb.status === 200 && typeof fb.data.feedback?.excludedFallbackAnswers === 'number' && fb.data.feedback?.levelReached === g.data.interview?.levelReached && fb.data.feedback?.responses?.every((x) => LEVELS.includes(x.level)), short(fb.data.feedback));
    const next = await create();
    check('the next interview starts at the level reached, without asking readiness', next.status === 201 && next.data.interview?.startLevel === g.data.interview?.levelReached, `${next.status} ${short(next.data)}`);
  }
  r = await stuA.req('POST', '/api/interviews/create-with-profile-cv', { jobDescription: 'x' }); check('create-with-profile-cv is 404', r.status === 404, String(r.status));
  r = await stuA.req('GET', `/api/interviews/${'0'.repeat(24)}/next-question`); check('next-question is 404', r.status === 404, String(r.status));
} else console.log('SKIP  mock interview (SKIP_AI=1)');
{
  const fd = new FormData(); fd.append('audio', new Blob([Buffer.from('not really audio')], { type: 'audio/webm' }), 'answer.webm');
  const t = await stuA.raw('POST', '/api/interviews/transcribe', { body: fd });
  // With no GROQ_API_KEY this is the honest "unavailable" answer; with a key, Groq refuses the fake audio the same way.
  check('voice answers report TRANSCRIPTION_UNAVAILABLE with the type-instead message', t.status === 503 && t.data.code === 'TRANSCRIPTION_UNAVAILABLE' && t.data.message === "Voice answers aren't available right now. Type your answer instead.", `${t.status} ${short(t.data)}`);
  const none = await stuA.raw('POST', '/api/interviews/transcribe', { body: new FormData() });
  check('transcription without an audio file is 400', none.status === 400, `${none.status} ${short(none.data)}`);
}
// ---------------------------------------------------------------- end of Task 6

// ---------------------------------------------------------------- compliance
r = await stuA.req('GET', '/api/me/export'); check('student data export', r.status === 200 && r.text.includes('student@email.com'), String(r.status));
r = await new Client('anon').req('GET', '/api/compliance/subprocessors'); check('subprocessors are public', r.status === 200);
r = await stuB.req('GET', '/api/practice/questions'); check('B student can read the global seed bank', r.status === 200 && (r.data.questions || []).length > 0);

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }
