// Real-browser walk through the current product (run prep.mjs first). No code runs on the server; the mock interview
// section runs code in the browser only and makes about 7 AI calls when an AI key is set (none without one).
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

// --- API helpers for setup and clean-up, so a run leaves the data as it found it (the suites can run again on a
// persistent local database).
const API = process.env.API || 'http://localhost:4000';
const apiClient = () => {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of r.headers.getSetCookie?.() || []) if (c.startsWith('token=')) cookie = c.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
};
const stamp = Date.now().toString(36);
const freshEmail = `e2e.fresh.${stamp}@email.com`;
const freshPassword = 'Fresh1!pass';
let originalRole = null;

try {
// 1. Student: login form, wrong password, signed-in /login and unknown URLs
// --- Target roles: the onboarding checks use a brand-new student, so they do not depend on what the seed or other
// suites gave the demo students. Sign up through the API, then open the dev verification link in the browser and
// choose the password there (sign-up itself takes no password).
const signupRes = await apiClient()('POST', '/api/auth/signup', { name: 'E2E Fresh', email: freshEmail });
const verifyToken = new URL(signupRes.data.devVerificationLink || 'http://x/?token=').searchParams.get('token');
ok('sign-up gives a dev verification link', signupRes.status === 200 && !!verifyToken, `${signupRes.status} ${JSON.stringify(signupRes.data)}`);
if (!verifyToken) throw new Error(`Sign-up of ${freshEmail} failed: ${signupRes.status} ${JSON.stringify(signupRes.data)}`);

let ctx = await newCtx();
let p = await ctx.newPage(); watch(p, 'fresh student');
await p.goto(`${B}/verify-email?token=${verifyToken}`, { waitUntil: 'networkidle' });
ok('the verification link opens a "Choose a password" form', await p.getByRole('button', { name: 'Finish signing up' }).count() === 1);
// Opening the page must not use the link: a verify without a password is refused and leaves the token usable.
const noPassword = await apiClient()('POST', '/api/auth/verify-email', { token: verifyToken });
ok('opening the link does not use it, and verify without a password is refused', noPassword.status === 400 && noPassword.data.code === 'WEAK_PASSWORD', `${noPassword.status} ${JSON.stringify(noPassword.data)}`);
await p.getByLabel('Password', { exact: true }).fill(freshPassword);
await p.getByLabel('Confirm password').fill(freshPassword);
await p.getByRole('button', { name: 'Finish signing up' }).click();
await p.waitForURL(/welcome/, { timeout: 15000 }).catch(() => {});
ok('student without a target role is sent to /welcome', /welcome/.test(p.url()), p.url());
await p.locator('[role="radio"]').first().waitFor({ timeout: 10000 }).catch(() => {});
ok('onboarding shows role cards', (await p.locator('[role="radio"]').count()) >= 2);
await p.screenshot({ path: 'e2e/onboarding-roles.png' });
await p.goto(B + '/fresher-dashboard', { waitUntil: 'networkidle' });
ok('a student still to onboard cannot open the dashboard', /welcome/.test(p.url()), p.url());
await p.locator('[role="radio"]').first().click();
await p.getByRole('button', { name: 'Continue' }).click();
await p.getByRole('button', { name: 'Skip for now' }).waitFor({ timeout: 10000 }).catch(() => {});
ok('onboarding step 2 offers a CV upload and "Skip for now"', await p.getByRole('button', { name: 'Skip for now' }).count() === 1);
await p.getByRole('button', { name: 'Skip for now' }).click();
await p.waitForURL(/fresher-dashboard/, { timeout: 15000 }).catch(() => {});
ok('after onboarding the new student lands on the dashboard', /fresher-dashboard/.test(p.url()), p.url());
await ctx.close();
// --- end Target roles

// The demo student has a target role from the seed (and a CV once smoke.mjs has run).
ctx = await newCtx();
p = await ctx.newPage(); watch(p, 'student');
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
  // Run in the browser: Python on the starter code fails the visible tests, with the "not graded" label
  await p.locator('select').first().selectOption('python');
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /^Run$/ }).click();
  await p.getByText('Ran in your browser: not graded. Submit to check on the server.').waitFor({ timeout: 90000 }).catch(() => {});
  const rt = await body(p);
  ok('Run in the browser shows the "Ran in your browser" label', rt.includes('Ran in your browser: not graded. Submit to check on the server.'));
  ok('Run in the browser lists the visible tests as failed for the starter code', /Failed/.test(rt) && /Test 1/.test(rt));
}

// 3. Removed pages (skills, question authoring, grading) are gone, with no link left in the navigation or on the home page
for (const path of ['/swot', '/questions', '/grading']) {
  await p.goto(B + path, { waitUntil: 'networkidle' });
  ok(`removed page (${path}) shows "Page not found"`, /Page not found/.test(await body(p)));
}
await p.goto(B + '/fresher-dashboard', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
ok('student home and navigation have no link to the removed pages', await p.locator('a[href="/swot"], a[href^="/questions"], a[href="/grading"]').count() === 0);

// 4. Profile: a bad phone is refused before saving
await p.goto(B + '/profile-settings', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
const phone = p.locator('#ps-phone');
if (await phone.count()) {
  await phone.fill('abc');
  await p.getByRole('button', { name: /update profile/i }).click(); await p.waitForTimeout(800);
  ok('profile shows the phone rule for a bad number', /10 to 15 digits/.test(await body(p)));
  await p.screenshot({ path: 'e2e/profile-phone.png' });
} else ok('profile phone field present', false, 'no #ps-phone');

// ---------------------------------------------------------------- Task 6: adaptive mock interview in the browser
// Needs a CV on file and a target role (smoke.mjs gives the demo student both). No AI key: generic questions and
// basic scoring, so every question stays at the starting level. The coding slot runs in the browser, never scored.
await p.goto(B + '/interview', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
let iv = await body(p);
if (/No CV yet|No target role yet/.test(iv)) {
  console.log('SKIP  mock interview in the browser (the demo student has no CV or target role: run smoke.mjs first)');
} else {
  ok('interview start screen shows the CV and the target role', /CV on file/.test(iv) && /Practising for/.test(iv) && /Start interview/.test(iv), iv.slice(0, 200));
  ok('job description is optional and collapsed', /Practising for a specific job\? Paste the description/.test(iv) && await p.locator('textarea').count() === 0);
  if (/How ready do you feel\?/.test(iv)) await p.getByRole('button', { name: /Some practice/ }).click();
  await p.getByRole('button', { name: /Start interview/ }).click();
  await p.getByText('Question 1 of 5').waitFor({ timeout: 30000 }).catch(() => {});
  const seen = [];
  for (let n = 1; n <= 5; n++) {
    iv = await body(p);
    if (!iv.includes(`Question ${n} of 5`)) { ok(`question ${n} of 5 is shown`, false, iv.slice(0, 200)); break; }
    seen.push((iv.match(/Question \d of 5\s*(Easy|Medium|Hard)/) || [])[1] || null);
    if (/Your code/.test(iv)) {
      await p.locator('.monaco-editor').first().waitFor({ timeout: 30000 }).catch(() => {});
      await p.getByRole('button', { name: /Run on the examples/ }).click();
      await p.getByText('Ran in your browser: not graded. Submit to check on the server.').waitFor({ timeout: 90000 }).catch(() => {});
      ok('coding slot: Run on the examples runs in the browser', (await body(p)).includes('Ran in your browser: not graded'));
      await p.screenshot({ path: 'e2e/interview-coding.png' });
    } else {
      await p.getByRole('button', { name: /Text\s*Type answer/ }).click();
      await p.locator('#iv-text-answer').fill('I built a REST API in Node.js with Express and MongoDB, and I wrote Jest tests for every route.');
    }
    await p.getByRole('button', { name: /Submit & (Continue|Finish)/ }).click();
    await p.getByText(n < 5 ? `Question ${n + 1} of 5` : 'Interview complete').waitFor({ timeout: 60000 }).catch(() => {});
  }
  ok('five questions, each with a level badge', seen.length === 5 && seen.every(Boolean), JSON.stringify(seen));
  iv = await body(p);
  ok('results show "Next interview starts at" a level and each question with its level', /Interview complete/.test(iv) && /Next interview starts at\s*(Easy|Medium|Hard)/.test(iv) && (iv.match(/Question \d\n/g) || []).length === 5, iv.slice(0, 300));
  await p.screenshot({ path: 'e2e/interview-results.png', fullPage: true });
}
// ---------------------------------------------------------------- end of Task 6
await ctx.close();

// 5. Dashboard (Task 7): the lecturer sees only Group 1
ctx = await newCtx(); const lp = await ctx.newPage(); watch(lp, 'lecturer');
await signIn(lp, 'lecturer@email.com', 'lecturer@123');
await lp.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
ok('lecturer login -> /dashboard', /\/dashboard/.test(lp.url()), lp.url());
await lp.waitForTimeout(1500);
const ov = await body(lp);
ok('overview shows CV score, interview score and next interview level', /Average CV score/.test(ov) && /Average interview score/.test(ov) && /Next interview level/.test(ov));
ok('student table has the new columns', /Target role/i.test(ov) && /CV score/i.test(ov) && /Trend/i.test(ov));
ok('lecturer sees only Group 1', /Group 1/.test(ov) && !/Group 2/.test(ov) && !/Student seats/.test(ov));
await lp.screenshot({ path: 'e2e/dashboard-lecturer.png', fullPage: true });
if (st.studentId) {
  await lp.goto(B + `/dashboard/students/${st.studentId}`, { waitUntil: 'networkidle' }); await lp.waitForTimeout(1500);
  ok('student profile opens', !/not found/i.test(await body(lp)));
  const ivLink = lp.locator('a[href*="/interviews/"]').first();
  if (await ivLink.count()) {
    await ivLink.click(); await lp.waitForTimeout(1500);
    ok('interview detail opens', /\/interviews\//.test(lp.url()));
    await lp.screenshot({ path: 'e2e/dashboard-interview.png', fullPage: true });
  } else ok('interview link present', false, 'none');
}
await ctx.close();

// 6a. Admin edits a target role in University settings (Task 4)
ctx = await newCtx(); const sp = await ctx.newPage(); watch(sp, 'settings');
await signIn(sp, 'admin@email.com', 'admin@123');
await sp.waitForURL(/manage-people/, { timeout: 15000 }).catch(() => {});
await sp.goto(B + '/settings', { waitUntil: 'networkidle' }); await sp.waitForTimeout(1000);
const settingsText = await body(sp);
ok('settings shows the read-only seat limit note', /Set in your contract. Contact us to change it./.test(settingsText));
{
  const adminApi = apiClient(); await adminApi('POST', '/api/auth/login', { email: 'admin@email.com', password: 'admin@123' });
  const first = (await adminApi('GET', '/api/institution/settings')).data.targetRoles?.[0];
  if (first) originalRole = { id: first.id, title: first.title, description: first.description, skills: first.skills };
}
await sp.getByRole('button', { name: /^Edit / }).first().click();
const editedTitle = 'E2E edited role ' + Date.now().toString(36);
await sp.getByLabel(/^Title/).fill(editedTitle);
await sp.getByRole('button', { name: 'Save role' }).click(); await sp.waitForTimeout(1200);
ok('admin edits a target role', (await body(sp)).includes(editedTitle));
await sp.screenshot({ path: 'e2e/settings.png', fullPage: true });
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
  await ap.getByRole('dialog').getByRole('button', { name: 'Cancel invite' }).click(); await ap.waitForTimeout(1500);
  ok('the invitation is cancelled (status deactivated)', /deactivated/.test(await body(ap)));
  await ap.screenshot({ path: 'e2e/admin-cancel-invite.png' });
}
// Task 7: lecturer groups on Manage people, and the admin dashboard with seats.
await ap.locator('#f-search').fill('lecturer@email.com'); await ap.waitForTimeout(1200);
ok('lecturer row shows its groups', /Groups: Group 1/.test(await body(ap)));
const editGroups = ap.getByRole('button', { name: /Edit groups of/ });
if (await editGroups.count()) {
  await editGroups.first().click(); await ap.waitForTimeout(1200);
  const dlg = ap.getByRole('dialog');
  const g1 = dlg.getByRole('checkbox', { name: 'Group 1' }); const g2 = dlg.getByRole('checkbox', { name: 'Group 2' });
  ok('edit groups dialog lists the groups with the current ones ticked', (await g1.count()) === 1 && (await g2.count()) === 1 && await g1.isChecked() && !(await g2.isChecked()));
  await ap.screenshot({ path: 'e2e/admin-edit-groups.png' });
  await dlg.getByRole('button', { name: 'Cancel' }).click();
} else ok('edit groups action present', false, 'none');
await ap.goto(B + '/dashboard', { waitUntil: 'networkidle' }); await ap.waitForTimeout(1500);
const ad = await body(ap);
ok('admin dashboard shows seats and every group', /Student seats/.test(ad) && /Group 1/.test(ad) && /Group 2/.test(ad));
await ap.screenshot({ path: 'e2e/dashboard-admin.png', fullPage: true });
await ap.goto(B + '/admin-overview', { waitUntil: 'networkidle' }); await ap.waitForTimeout(800);
ok('the old admin overview page is gone', !/Adoption and renewal/i.test(await body(ap)));
await ctx.close();

} finally {
  // Put everything back: the new student is erased with their own password, the edited role gets its original text
  // back, and the pending invitation from prep.mjs is cancelled if the browser step did not do it.
  try {
    const me = apiClient();
    const login = await me('POST', '/api/auth/login', { email: freshEmail, password: freshPassword });
    if (login.status === 200) {
      const del = await me('DELETE', '/api/me', { password: freshPassword });
      if (del.status !== 200) console.log(`WARN  could not remove ${freshEmail}: ${del.status} ${JSON.stringify(del.data)}`);
    }
    const admin = apiClient(); await admin('POST', '/api/auth/login', { email: 'admin@email.com', password: 'admin@123' });
    if (originalRole) {
      const back = await admin('PATCH', `/api/institution/target-roles/${originalRole.id}`, { title: originalRole.title, description: originalRole.description, skills: originalRole.skills });
      if (back.status !== 200) console.log(`WARN  could not restore the target role: ${back.status} ${JSON.stringify(back.data)}`);
    }
    if (st.inviteEmail) {
      const found = (await admin('GET', `/api/institution/people?search=${encodeURIComponent(st.inviteEmail)}`)).data.people || [];
      for (const person of found.filter((x) => x.email === st.inviteEmail && x.status === 'invited')) await admin('PATCH', `/api/institution/people/${person.id}/deactivate`);
    }
  } catch (error) {
    console.log('WARN  clean-up failed:', error.message);
  }
  console.log('\nbrowser errors:', errs.length ? errs.slice(0, 8) : 'none');
  console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed`);
  if (results.some((r) => !r[1])) process.exitCode = 1;
  await browser.close();
}
