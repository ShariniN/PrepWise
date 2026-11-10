// Live smoke test against the local embedded-DB server. Reads demo passwords from the server log.
import fs from 'node:fs';
const LOG = process.argv[2];
const BASE = 'http://localhost:4000';
const log = fs.readFileSync(LOG, 'utf8');
const pw = (label, who) => {
  const re = new RegExp(`${who}[^\\n]*password(?: \\(all 40\\))?: (\\S+)`);
  const m = log.match(re); if (!m) throw new Error('no pw for ' + who); return m[1];
};
const creds = {
  adminA: ['admin@email.com', pw('', 'admin@email.com')],
  lectA: ['lecturer@email.com', pw('', 'lecturer@email.com')],
  careersA: ['careers@email.com', pw('', 'careers@email.com')],
  studentA: ['student@email.com', pw('', 'student@email.com')],
  adminB: ['admin@demo-b.test', pw('', 'admin@demo-b.test')],
  studentB: ['student@demo-b.test', pw('', 'student@demo-b.test')],
};

class Client {
  constructor(name) { this.name = name; this.cookie = ''; }
  async req(method, path, body) {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) if (c.startsWith('token=')) this.cookie = c.split(';')[0];
    let data; const text = await res.text(); try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
    return { status: res.status, data };
  }
  async login([email, password]) { const r = await this.req('POST', '/api/auth/login', { email, password }); return r; }
}

const results = []; const fails = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); if (!ok) fails.push(`${name} ${detail}`); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

const adminA = new Client('adminA'), lectA = new Client('lectA'), careersA = new Client('careersA'), stuA = new Client('stuA'), adminB = new Client('adminB'), stuB = new Client('stuB');
for (const [c, k] of [[adminA, 'adminA'], [lectA, 'lectA'], [careersA, 'careersA'], [stuA, 'studentA'], [adminB, 'adminB'], [stuB, 'studentB']]) {
  const r = await c.login(creds[k]); check(`login ${k}`, r.status === 200 && r.data.success, JSON.stringify(r.data).slice(0, 150));
}
check('is-auth returns role', (await stuA.req('GET', '/api/auth/is-auth')).data?.user?.role === 'student');

// ---- admin / people
let r = await adminA.req('GET', '/api/institution/usage'); check('admin usage', r.status === 200 && r.data.studentLimit === 60, JSON.stringify(r.data).slice(0, 200));
r = await adminA.req('GET', '/api/institution/people?role=student'); check('admin people list', r.status === 200 && (r.data.people?.length ?? r.data.data?.length) > 0, JSON.stringify(r.data).slice(0, 200));
r = await adminA.req('POST', '/api/institution/people/invite', { email: 'newkid@demo-a.test', name: 'New Kid', role: 'student' }); check('admin invite student', r.status === 200 || r.status === 201, JSON.stringify(r.data).slice(0, 200));
const inviteLink = r.data.inviteLink; check('invite link returned in dev', !!inviteLink);
if (inviteLink) {
  const token = new URL(inviteLink).searchParams.get('token');
  const anon = new Client('anon');
  const a = await anon.req('POST', '/api/auth/accept-invite', { token, password: 'Newpass1!', name: 'New Kid' });
  check('accept invite', a.status === 200 && a.data.success, JSON.stringify(a.data).slice(0, 200));
  const again = await new Client('x').req('POST', '/api/auth/accept-invite', { token, password: 'Newpass1!' }); check('invite is single use', again.status === 400);
}
r = await adminA.req('POST', '/api/institution/people/invite', { email: 'x@evil.com', name: 'Bad', role: 'student' }); check('email domain enforced', r.status >= 400, JSON.stringify(r.data).slice(0, 120));
r = await adminA.req('POST', '/api/institution/people/import', { csv: 'email,name,role\nimp1@demo-a.test,Imp One,student\nimp2@demo-a.test,Imp Two,student\n' }); check('csv import', r.status === 200, JSON.stringify(r.data).slice(0, 200));

// ---- tenancy
r = await adminB.req('GET', '/api/institution/people?search=student01'); const bEmails = JSON.stringify(r.data); check('B admin cannot see A people', !bEmails.includes('demo-a.test') && !bEmails.includes('@email.com'));
r = await stuA.req('GET', '/api/institution/people'); check('student blocked from manage-people', r.status === 403);
r = await stuA.req('GET', '/api/user/freshers'); check('old admin route gone', r.status === 404);

// ---- courses
r = await lectA.req('GET', '/api/courses/mine'); const courses = r.data.courses || r.data.data || []; check('lecturer courses', r.status === 200, JSON.stringify(r.data).slice(0, 200));
const courseId = courses[0]?.id || courses[0]?._id; const cohortId = courses[0]?.cohorts?.[0]?.id || courses[0]?.cohorts?.[0]?._id;
check('course+cohort ids found', !!courseId && !!cohortId, JSON.stringify(courses).slice(0, 300));
r = await stuA.req('GET', '/api/courses/mine'); check('student courses', r.status === 200);

// ---- practice (student)
r = await stuA.req('GET', '/api/practice/questions?type=coding'); const qs = r.data.questions || r.data.data || []; check('practice list', r.status === 200 && qs.length > 0, JSON.stringify(r.data).slice(0, 200));
const q = qs[0]; const qid = q?.id || q?._id;
r = await stuA.req('GET', `/api/practice/questions/${qid}`); const qj = JSON.stringify(r.data);
check('question detail', r.status === 200); check('no reference solution leaked', !/referenceSolution|wrongSolution/.test(qj));
const hiddenLeak = (r.data.question?.tests || r.data.tests || []).some?.((t) => t.visible === false && (t.input != null || t.expectedOutput != null));
check('no hidden test data leaked', !hiddenLeak);
r = await stuA.req('POST', `/api/practice/questions/${qid}/run`, { language: 'python', source: 'print(1)' }); check('run -> unavailable (no sandbox), not fake success', r.status === 503, `${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
r = await stuA.req('POST', `/api/practice/questions/${qid}/submit`, { language: 'python', source: 'print(1)' }); check('submit -> unavailable and no score', r.status === 503, `${r.status}`);
r = await stuA.req('GET', '/api/practice/questions?type=mcq'); const mcq = (r.data.questions || [])[0];
if (mcq) { const mid = mcq.id || mcq._id; const d = await stuA.req('GET', `/api/practice/questions/${mid}`); const opts = d.data.question?.options || d.data.options || []; const s = await stuA.req('POST', `/api/practice/questions/${mid}/submit`, { answer: [0], selected: [0], choice: 0 }); check('mcq submit works server-side', s.status === 200 || s.status === 400, `${s.status} ${JSON.stringify(s.data).slice(0, 200)}`); }

// ---- question bank (lecturer)
r = await lectA.req('GET', '/api/questions'); check('lecturer question list', r.status === 200, JSON.stringify(r.data).slice(0, 150));
r = await lectA.req('POST', '/api/questions', { title: 'Sum two numbers', statement: 'Read two ints, print sum.', type: 'coding', difficulty: 'easy', topic: ['basics'], languages: ['python'], referenceSolution: { language: 'python', source: 'a,b=map(int,input().split())\nprint(a+b)' } });
check('lecturer creates question', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.data).slice(0, 250)}`);
const newQ = r.data.question || r.data.data; const newQid = newQ?.id || newQ?._id;
if (newQid) {
  const t = await lectA.req('POST', `/api/questions/${newQid}/tests`, { input: '1 2', expectedOutput: '3', visible: true, weight: 1 }); check('add test case', t.status === 200 || t.status === 201, `${t.status} ${JSON.stringify(t.data).slice(0, 200)}`);
  const v = await lectA.req('POST', `/api/questions/${newQid}/validate`, {}); check('validate -> sandbox unavailable (honest)', v.status === 503 || v.data?.verdict === 'unavailable' || v.data?.unavailable, `${v.status} ${JSON.stringify(v.data).slice(0, 200)}`);
  const pub = await lectA.req('PATCH', `/api/questions/${newQid}/status`, { status: 'published' }); check('publish blocked without validation', pub.status >= 400, `${pub.status} ${JSON.stringify(pub.data).slice(0, 160)}`);
}
r = await stuA.req('GET', '/api/questions'); check('student blocked from question API', r.status === 403);
r = await adminB.req('GET', '/api/questions'); check('B admin question list excludes A-owned', !JSON.stringify(r.data).includes('Sum two numbers'));

// ---- analytics (real Mongo queries)
const an = async (c, path, name) => { const x = await c.req('GET', path); check(name, x.status === 200, `${x.status} ${JSON.stringify(x.data).slice(0, 200)}`); return x; };
if (courseId) {
  const qs2 = `?courseId=${courseId}${cohortId ? `&cohortId=${cohortId}` : ''}`;
  await an(lectA, `/api/analytics/lecturer/failure-patterns${qs2}`, 'analytics failure-patterns');
  await an(lectA, `/api/analytics/lecturer/topic-heatmap${qs2}`, 'analytics topic-heatmap');
  await an(lectA, `/api/analytics/lecturer/students-needing-help${qs2}`, 'analytics students-needing-help');
  await an(lectA, `/api/analytics/lecturer/question-quality${qs2}`, 'analytics question-quality');
  await an(lectA, `/api/analytics/lecturer/activity${qs2}`, 'analytics activity');
  const o = await adminB.req('GET', `/api/analytics/lecturer/failure-patterns${qs2}`); check('B cannot read A course analytics', o.status === 404 || o.status === 403, String(o.status));
  const s = await stuA.req('GET', `/api/analytics/lecturer/activity${qs2}`); check('student blocked from analytics', s.status === 403);
}
await an(careersA, '/api/analytics/careers/readiness', 'careers readiness');
await an(careersA, '/api/analytics/careers/coverage', 'careers coverage');
await an(careersA, '/api/analytics/careers/skills-gap', 'careers skills-gap');
const csv = await careersA.req('GET', '/api/analytics/careers/readiness.csv'); check('careers csv', csv.status === 200);
await an(adminA, '/api/analytics/admin/overview', 'admin overview');
await an(adminA, '/api/analytics/admin/evidence', 'admin evidence');
r = await lectA.req('GET', '/api/grading/queue'); check('grading queue', r.status === 200, `${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);

// ---- assessments end-to-end
if (courseId && qid) {
  const now = Date.now();
  r = await lectA.req('POST', '/api/assessments', { title: 'Smoke Test Quiz', courseId, cohortId, questionIds: [qid, mcq && (mcq.id || mcq._id)].filter(Boolean), opensAt: new Date(now - 60000).toISOString(), closesAt: new Date(now + 3600000).toISOString(), durationMinutes: 30, attemptsAllowed: 1, integrityLevel: 1 });
  check('create assessment', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.data).slice(0, 250)}`);
  const aid = (r.data.assessment || r.data.data)?.id || (r.data.assessment || r.data.data)?._id;
  if (aid) {
    let st = await lectA.req('PATCH', `/api/assessments/${aid}/status`, { status: 'open' }); check('open assessment', st.status === 200, `${st.status} ${JSON.stringify(st.data).slice(0, 200)}`);
    const list = await stuA.req('GET', '/api/assessments'); check('student sees assessment', JSON.stringify(list.data).includes('Smoke Test Quiz'), JSON.stringify(list.data).slice(0, 200));
    const start = await stuA.req('POST', `/api/assessments/${aid}/start`, {}); check('student starts session', start.status === 200 || start.status === 201, `${start.status} ${JSON.stringify(start.data).slice(0, 250)}`);
    const sess = start.data.session || start.data.data; const sid = sess?.id || sess?._id;
    check('server deadline present', !!(sess?.deadline || sess?.deadlineAt));
    if (sid) {
      const ev = await stuA.req('POST', `/api/assessments/sessions/${sid}/integrity-events`, { events: [{ type: 'tab_hidden', t: 1000 }, { type: 'tab_visible', t: 9000 }, { type: 'paste', t: 12000, meta: { length: 1800, inEditor: true } }] }); check('integrity events accepted', ev.status === 200 || ev.status === 201, `${ev.status} ${JSON.stringify(ev.data).slice(0, 200)}`);
      const run = await stuA.req('POST', `/api/assessments/sessions/${sid}/questions/${qid}/submit`, { language: 'python', source: 'print(1)' }); check('assessment submit unavailable not faked', run.status === 503 || run.status === 404 || run.status === 400, `${run.status} ${JSON.stringify(run.data).slice(0, 200)}`);
      const fin = await stuA.req('POST', `/api/assessments/sessions/${sid}/finish`, {}); check('finish session', fin.status === 200, `${fin.status} ${JSON.stringify(fin.data).slice(0, 200)}`);
      const cases = await lectA.req('GET', '/api/integrity/cases'); check('integrity case list (real Mongo)', cases.status === 200, `${cases.status} ${JSON.stringify(cases.data).slice(0, 250)}`);
      const sc = await stuA.req('GET', '/api/integrity/cases'); check('student cannot list integrity cases', sc.status === 403 || (sc.status === 200 && (sc.data.cases || []).length === 0), String(sc.status));
      const rep = await lectA.req('GET', `/api/integrity/sessions/${sid}/replay?questionId=${qid}`); check('replay endpoint', rep.status === 200, `${rep.status} ${JSON.stringify(rep.data).slice(0, 150)}`);
    }
  }
}

// ---- compliance
r = await stuA.req('GET', '/api/me/export'); check('student data export', r.status === 200 && JSON.stringify(r.data).includes('student@email.com'), String(r.status));
r = await new Client('anon').req('GET', '/api/compliance/subprocessors'); check('subprocessors public', r.status === 200);
r = await stuB.req('GET', '/api/practice/questions'); check('B student can read global seed bank', r.status === 200 && (r.data.questions || []).length > 0);

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach((f) => console.log(' - ' + f)); }
