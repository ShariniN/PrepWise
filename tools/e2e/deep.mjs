// 30 demo students answer MCQ practice questions, then the lecturer and admin dashboards are checked for data.
// No AI and no code runner are used (MCQs are graded on the server). Usage: node deep.mjs   (API=http://localhost:4000)
const BASE = process.env.API || 'http://localhost:4000';
class C {
  constructor() { this.cookie = ''; }
  async req(m, p, b) {
    const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
    for (const c of r.headers.getSetCookie?.() || []) if (c.startsWith('token=')) this.cookie = c.split(';')[0];
    const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d };
  }
}
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };

const lect = new C(); await lect.req('POST', '/api/auth/login', { email: 'lecturer@email.com', password: 'lecturer@123' });
const s0 = new C(); await s0.req('POST', '/api/auth/login', { email: 'student@email.com', password: 'student@123' });
const mcqs = ((await s0.req('GET', '/api/practice/questions?type=mcq')).data.questions || []).slice(0, 4);
check('found MCQ practice questions', mcqs.length > 0, String(mcqs.length));

const before = (await lect.req('GET', '/api/dashboard/students?pageSize=100&sort=name')).data.students || [];
let sub = 0, ok = 0;
for (let i = 1; i <= 30; i++) {
  const c = new C(); const e = i === 1 ? 'student@email.com' : `student${String(i).padStart(2, '0')}@demo-a.test`;
  const l = await c.req('POST', '/api/auth/login', { email: e, password: 'student@123' }); if (l.status !== 200) { console.log('login fail', e, l.status); continue; }
  for (const q of mcqs) {
    const id = q.id || q._id;
    const d = (await c.req('GET', `/api/practice/questions/${id}`)).data; const n = (d.question?.options || []).length || 4;
    const r = await c.req('POST', `/api/practice/questions/${id}/submit`, { selected: [i % n] }); sub++; if (r.status === 200) ok++;
  }
}
check('every MCQ submission is graded', sub > 0 && ok === sub, `${ok}/${sub}`);

const after = (await lect.req('GET', '/api/dashboard/students?pageSize=100&sort=name')).data.students || [];
const solvedBefore = before.reduce((n, s) => n + (s.practiceSolved || 0), 0);
const solvedAfter = after.reduce((n, s) => n + (s.practiceSolved || 0), 0);
check('lecturer table shows more practice solved', solvedAfter > solvedBefore, `${solvedBefore} -> ${solvedAfter}`);
// Task 7: the lecturer sees only Group 1; the admin sees everyone plus seats.
const ov = await lect.req('GET', '/api/dashboard/overview');
check('lecturer overview still loads (Group 1 only)', ov.status === 200 && ov.data.students >= 20 && JSON.stringify(ov.data.groups) === '["Group 1"]' && ov.data.practiceSolved > 0, JSON.stringify(ov.data).slice(0, 200));
check('lecturer table is Group 1 only', after.length > 0 && after.every((s) => s.group === 'Group 1'), JSON.stringify(after.map((s) => s.group)).slice(0, 200));
const top = await lect.req('GET', '/api/dashboard/students?sort=-practiceSolved&pageSize=3');
check('sort by practice solved', top.status === 200 && top.data.students[0].practiceSolved >= top.data.students[2].practiceSolved, JSON.stringify(top.data).slice(0, 200));
const adm = new C(); await adm.req('POST', '/api/auth/login', { email: 'admin@email.com', password: 'admin@123' });
const ao = await adm.req('GET', '/api/dashboard/overview');
check('admin dashboard overview loads with seats', ao.status === 200 && ao.data.students >= 40 && typeof ao.data.seats?.used === 'number' && ao.data.practiceSolved >= ov.data.practiceSolved, JSON.stringify(ao.data).slice(0, 200));
const old = await adm.req('GET', '/api/analytics/admin/overview'); check('old admin analytics path is 404', old.status === 404, String(old.status));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((x) => !x)) process.exitCode = 1;
