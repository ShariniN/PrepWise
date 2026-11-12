// Prepares data for e2e.mjs: a pending invitation (to cancel in the browser), a coding question id and a student
// with a completed interview. Writes e2e-state.json (git-ignored). Usage: node prep.mjs   (API=http://localhost:4000)
import fs from 'node:fs';
const B = process.env.API || 'http://localhost:4000';
const client = () => {
  let cookie = '';
  return async (m, p, b) => {
    const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
    for (const c of r.headers.getSetCookie?.() || []) if (c.startsWith('token=')) cookie = c.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
};
const admin = client(); await admin('POST', '/api/auth/login', { email: 'admin@email.com', password: 'admin@123' });
const lect = client(); await lect('POST', '/api/auth/login', { email: 'lecturer@email.com', password: 'lecturer@123' });
const stu = client(); await stu('POST', '/api/auth/login', { email: 'student@email.com', password: 'student@123' });

const inviteEmail = `e2e-pending-${Date.now().toString(36)}@demo-a.test`;
const inv = await admin('POST', '/api/institution/people/invite', { email: inviteEmail, name: 'E2E Pending', role: 'student' });
const coding = ((await stu('GET', '/api/practice/questions?type=coding')).data.questions || [])[0];
const top = (await lect('GET', '/api/dashboard/students?sort=-lastInterviewScore&pageSize=1')).data.students?.[0];
const state = { inviteEmail, invited: inv.status === 201, codingId: coding?.id || coding?._id, studentId: top?.id };
fs.writeFileSync('e2e-state.json', JSON.stringify(state, null, 2));
console.log(state);
