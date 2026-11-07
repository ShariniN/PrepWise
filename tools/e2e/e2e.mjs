import { chromium } from 'playwright-core';
import fs from 'node:fs';

const log = fs.readFileSync('demo-credentials.log', 'utf8');
const pw = (s) => log.split('\n').find((l) => l.includes(s)).trim().split(/\s+/).pop();
const st = JSON.parse(fs.readFileSync('e2e-state.json', 'utf8'));
const B = 'http://localhost:5173';
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync('e2e', { recursive: true });

const results = [];
const ok = (n, c, d = '') => { results.push([n, c]); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + d}`); };
const browser = await chromium.launch({ executablePath: exe, headless: true });
const newCtx = () => browser.newContext({ viewport: { width: 1440, height: 900 } });
const errs = [];
const watch = (p, tag) => {
  p.on('response', (r) => { if (r.status() >= 400 && r.status() !== 401 && r.status() !== 404) r.text().then((t) => console.log('   [http ' + r.status() + '] ' + tag + ' ' + r.request().method() + ' ' + r.url().replace('http://localhost:4000','').slice(0,110) + ' => ' + t.slice(0,160))).catch(() => {}); });
  p.on('pageerror', (e) => errs.push(tag + ': ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/401|404|Unauthorized/.test(m.text())) errs.push(tag + ' console: ' + m.text().slice(0, 200)); });
};
const body = (p) => p.locator('body').innerText();
const signIn = async (p, email, password) => {
  await p.goto(B + '/login', { waitUntil: 'networkidle' });
  await p.getByPlaceholder('Enter your email address').fill(email);
  await p.getByPlaceholder('••••••••').fill(password);
  await p.getByRole('button', { name: /sign in|login|log in/i }).first().click();
};

// 1. Student signs in through the real form
let ctx = await newCtx();
let p = await ctx.newPage();
watch(p, 'student');
await signIn(p, 'student01@demo-a.test', pw('student01@demo-a.test ..'));
await p.waitForURL(/fresher-dashboard/, { timeout: 15000 }).catch(() => {});
ok('student login form -> dashboard', /fresher-dashboard/.test(p.url()), p.url());

const ctxBad = await newCtx();
const pb = await ctxBad.newPage();
await signIn(pb, 'student01@demo-a.test', 'Wrong1!pass');
await pb.waitForTimeout(1500);
ok('wrong password stays on login', /login/.test(pb.url()));
await ctxBad.close();

// 2. Practice
await p.goto(B + '/practice', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
const rows = await p.locator('a[href^="/practice/"]').count();
ok('practice list shows questions', rows > 0, String(rows));
await p.goto(B + '/practice/' + st.ids[2], { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const runBtn = p.getByRole('button', { name: /^run$/i });
if (await runBtn.count()) {
  await runBtn.click();
  await p.waitForTimeout(2500);
  ok('Run shows honest unavailable notice (no fake output)', /unavailable|not been scored|not configured/i.test(await body(p)));
  await p.screenshot({ path: 'e2e/run-unavailable.png' });
} else {
  ok('run button present on first question', false, 'no Run button');
}

// 3. Exam intro -> acknowledge -> start
await p.goto(B + '/assessments', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
ok('assessment visible to student', /E2E Seventh Check/.test(await body(p)));
await p.goto(B + `/assessments/${st.aid}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
ok('intro states what is recorded (no camera)', /camera/i.test(await body(p)));
await p.screenshot({ path: 'e2e/exam-intro.png' });
const startBtn = p.getByRole('button', { name: /^Start/ });
ok('Start disabled until acknowledged', await startBtn.isDisabled());
await p.getByRole('checkbox').check();
await startBtn.click();
await p.waitForURL(/assessments\/session\//, { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(2500);
ok('exam session opened', /assessments\/session\//.test(p.url()), p.url());
await p.screenshot({ path: 'e2e/exam-session.png' });
ok('countdown timer visible', /\d{1,2}:\d{2}/.test(await body(p)));

// 4. Integrity signals from a real browser page
for (let i = 0; i < 6; i++) {
  await p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await p.waitForTimeout(600);
}
ok('return-to-page banner says it was recorded', /recorded|noted|logged/i.test(await body(p)));
await p.screenshot({ path: 'e2e/exam-after-leave.png' });

const opt = p.getByRole('radio').first();
if (await opt.count()) await opt.check();
const save = p.getByRole('button', { name: /submit|save/i }).first();
if (await save.count()) { await save.click(); await p.waitForTimeout(1500); }
const afterSave = await body(p);
ok('assessment mode does not reveal verdict or score', !/accepted|wrong answer|score:? ?\d+/i.test(afterSave));

// type into the code editor (find the coding question in the shuffled navigator)
let typed = false;
for (const label of ['1', '2', '3']) {
  const nb = p.getByRole('button', { name: new RegExp('^' + label + '$') }).first();
  if (!(await nb.count())) continue;
  await nb.click().catch(() => {});
  await p.waitForTimeout(1200);
  if (await p.locator('.monaco-editor').count()) {
    await p.locator('.monaco-editor').first().click();
    await p.keyboard.type('def solve(a):\n    return sorted(a)\n', { delay: 40 });
    typed = true;
    break;
  }
}
ok('typed into the code editor', typed);
await p.waitForTimeout(11000);
await p.evaluate(() => {
  const target = document.querySelector('textarea') || document.body;
  const dt = new DataTransfer();
  dt.setData('text/plain', 'x'.repeat(1800));
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await p.waitForTimeout(6500);
const finish = p.getByRole('button', { name: /finish/i }).first();
if (await finish.count()) {
  await finish.click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /finish|confirm|yes/i }).last().click().catch(() => {});
  await p.waitForTimeout(2500);
}
await p.screenshot({ path: 'e2e/exam-finished.png' });
ok('finish flow completes without error', !/Could not finish/i.test(await body(p)));
await ctx.close();

// 5. Lecturer reviews in the UI
ctx = await newCtx();
const lp = await ctx.newPage();
watch(lp, 'lecturer');
await signIn(lp, 'lecturer1@demo-a.test', pw('lecturer1@demo-a.test'));
await lp.waitForURL(/staff/, { timeout: 15000 }).catch(() => {});
ok('lecturer login -> staff dashboard', /staff/.test(lp.url()), lp.url());
await lp.goto(B + '/integrity', { waitUntil: 'networkidle' });
await lp.waitForTimeout(1500);
await lp.screenshot({ path: 'e2e/integrity-queue.png' });
const qtxt = await body(lp);
ok('integrity queue lists a case with reasons', /left the page|pasted/i.test(qtxt), qtxt.slice(0, 160).replace(/\n/g, ' '));
ok('queue wording is neutral', !/cheat/i.test(qtxt));
const caseLink = lp.locator('a[href^="/integrity/"]').first();
if (await caseLink.count()) {
  await caseLink.click();
  await lp.waitForTimeout(2500);
  await lp.screenshot({ path: 'e2e/integrity-case.png', fullPage: true });
  ok('case page shows timeline and evidence', /timeline|evidence/i.test(await body(lp)));
  const rep = lp.locator('a[href*="/integrity/replay/"]').first();
  if (await rep.count()) {
    await rep.click();
    await lp.waitForTimeout(2500);
    await lp.screenshot({ path: 'e2e/integrity-replay.png', fullPage: true });
    ok('replay page renders', /replay|play|speed/i.test(await body(lp)));
  } else ok('replay link present', false, 'no replay link');
} else ok('case link present', false, 'no case rows');
await ctx.close();

console.log('\nbrowser errors:', errs.length ? errs.slice(0, 8) : 'none');
console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed`);
await browser.close();
