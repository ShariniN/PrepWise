// Real-browser walk through the current product (run prep.mjs first). No AI calls and no code runs.
// Usage: node e2e.mjs   (WEB=http://localhost:5173, screenshots go to ./e2e/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const st = JSON.parse(fs.readFileSync('e2e-state.json', 'utf8'));
const B = process.env.WEB || 'http://localhost:5173';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
fs.mkdirSync('e2e', { recursive: true });

const results = [];
const ok = (n, c, d = '') => { results.push([n, !!c]); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + d}`); };
const browser = await chromium.launch({ executablePath: exe, headless: true });
const newCtx = () => browser.newContext({ viewport: { width: 1440, height: 900 } });
const errs = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(tag + ': ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/401|403|404|Unauthorized|Failed to load resource/.test(m.text())) errs.push(tag + ' console: ' + m.text().slice(0, 200)); });
};
const body = (p) => p.locator('body').innerText();
const signIn = async (p, email, password) => {
  await p.goto(B + '/login', { waitUntil: 'networkidle' });
  await p.getByPlaceholder('Enter your email address').fill(email);
  await p.getByPlaceholder('••••••••').fill(password);
  await p.getByRole('button', { name: /log in/i }).first().click();
};

// 1. Student: login form, wrong password, signed-in /login and unknown URLs
let ctx = await newCtx();
let p = await ctx.newPage(); watch(p, 'student');
await signIn(p, 'student@email.com', 'student@123');
await p.waitForURL(/fresher-dashboard/, { timeout: 15000 }).catch(() => {});
ok('student login form -> dashboard', /fresher-dashboard/.test(p.url()), p.url());
await p.goto(B + '/login', { waitUntil: 'networkidle' });
ok('signed-in student opening /login goes home', /fresher-dashboard/.test(p.url()), p.url());
await p.goto(B + '/no/such/page', { waitUntil: 'networkidle' });
ok('unknown URL shows "Page not found" with a link home', /Page not found/.test(await body(p)) && await p.getByRole('link', { name: /home page/i }).count() > 0);
await p.goto(B + '/assessments', { waitUntil: 'networkidle' });
ok('removed page (/assessments) shows "Page not found"', /Page not found/.test(await body(p)));

const bad = await newCtx(); const pb = await bad.newPage();
await signIn(pb, 'student@email.com', 'Wrong1!pass'); await pb.waitForTimeout(1500);
ok('wrong password stays on login', /login/.test(pb.url()));
await bad.close();

// 2. Practice: list, a coding question without a repeated example, nothing run
await p.goto(B + '/practice', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
ok('practice list shows questions', (await p.locator('a[href^="/practice/"]').count()) > 0);
if (st.codingId) {
  await p.goto(B + '/practice/' + st.codingId, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const t = await body(p);
  ok('coding question page renders with an editor', (await p.locator('.monaco-editor').count()) > 0);
  ok('statement example is not repeated under "Examples"', !(/\bExample\b/.test(t) && /\nExamples\n/.test(t)));
  await p.screenshot({ path: 'e2e/practice-question.png' });
}

// 3. Skills page without a CV analysis: no debug text, link to the CV analyzer
await p.goto(B + '/swot', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
const sk = await body(p);
ok('skills page asks for a CV analysis, no debug text', /Analyse your CV first/.test(sk) && !/Debug info/.test(sk));
ok('skills page links to the CV analyzer', await p.getByRole('link', { name: /CV Analyzer/i }).count() > 0);

// 4. Profile: a bad phone is refused before saving
await p.goto(B + '/profile-settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
const phone = p.locator('#ps-phone');
if (await phone.count()) {
  await phone.fill('abc');
  await p.getByRole('button', { name: /update profile/i }).click(); await p.waitForTimeout(800);
  ok('profile shows the phone rule for a bad number', /10 to 15 digits/.test(await body(p)));
  await p.screenshot({ path: 'e2e/profile-phone.png' });
} else ok('profile phone field present', false, 'no #ps-phone');
await ctx.close();

// 5. Lecturer dashboard
ctx = await newCtx(); const lp = await ctx.newPage(); watch(lp, 'lecturer');
await signIn(lp, 'lecturer@email.com', 'lecturer@123');
await lp.waitForURL(/staff/, { timeout: 15000 }).catch(() => {});
ok('lecturer login -> /staff', /staff/.test(lp.url()), lp.url());
await lp.waitForTimeout(1500);
const ov = await body(lp);
ok('overview shows interview and CV blocks', /CVs/.test(ov) && /interview/i.test(ov));
await lp.screenshot({ path: 'e2e/staff-overview.png', fullPage: true });
if (st.studentId) {
  await lp.goto(B + `/staff/students/${st.studentId}`, { waitUntil: 'networkidle' }); await lp.waitForTimeout(1500);
  ok('student profile opens', !/not found/i.test(await body(lp)));
  const ivLink = lp.locator('a[href*="/interviews/"]').first();
  if (await ivLink.count()) {
    await ivLink.click(); await lp.waitForTimeout(1500);
    ok('interview detail opens', /\/interviews\//.test(lp.url()));
    await lp.screenshot({ path: 'e2e/staff-interview.png', fullPage: true });
  } else ok('interview link present', false, 'none');
}
await ctx.close();

// 6. Admin: cancel a pending invitation in Manage people
ctx = await newCtx(); const ap = await ctx.newPage(); watch(ap, 'admin');
await signIn(ap, 'admin@email.com', 'admin@123');
await ap.waitForURL(/manage-people/, { timeout: 15000 }).catch(() => {});
ok('admin login -> manage people', /manage-people/.test(ap.url()), ap.url());
await ap.locator('#f-search').fill(st.inviteEmail); await ap.waitForTimeout(1200);
const cancel = ap.getByRole('button', { name: 'Cancel invite' });
ok('invited person has a "Cancel invite" action', await cancel.count() === 1);
if (await cancel.count()) {
  await cancel.click();
  await ap.getByRole('button', { name: 'Cancel invitation' }).click(); await ap.waitForTimeout(1500);
  ok('the invitation is cancelled (status deactivated)', /deactivated/.test(await body(ap)));
  await ap.screenshot({ path: 'e2e/admin-cancel-invite.png' });
}
await ctx.close();

console.log('\nbrowser errors:', errs.length ? errs.slice(0, 8) : 'none');
console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed`);
if (results.some((r) => !r[1])) process.exitCode = 1;
await browser.close();
