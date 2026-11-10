// Checks the in-browser code runner (client/src/features/practice/browserRunner) in real Chrome against every seeded
// coding question: the REFERENCE solution, in Python and JavaScript, must pass every visible test (the ones the
// practice API sends to the browser) and every hidden test of the seed. Also checks that endless loops end with
// timedOut within the limit plus 2 s, and that a wrong solution fails.
// A language the runner declines for a question (returns null) is listed, not failed: the student's Run then uses
// the server. Needs the dev stack (the runner is exposed on window.__prepwiseRunner in dev builds only) and
// internet access (Pyodide is loaded from jsDelivr).
// Usage: node browser-runner-check.mjs   (API=http://localhost:4000 WEB=http://localhost:5173)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const API = process.env.API || 'http://localhost:4000';
const WEB = process.env.WEB || 'http://localhost:5173';
const SEED_DIR = new URL('../../server/seed/questions/', import.meta.url);
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!exe) { console.error('Neither Chrome nor Edge was found. Install one of them or edit the paths at the top of this script.'); process.exit(2); }
const LANGS = ['javascript', 'python'];

const seed = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(fs.readFileSync(new URL(f, SEED_DIR), 'utf8')))
  .filter((q) => q.type === 'coding');
const seedByTitle = new Map(seed.map((q) => [q.title, q]));

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`FAIL  ${msg}`); };

const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

try {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Enter your email address').fill('student@email.com');
  await page.getByPlaceholder('••••••••').fill('student@123');
  await page.getByRole('button', { name: /log in/i }).first().click();
  await page.waitForURL(/fresher-dashboard/, { timeout: 15000 });
  await page.waitForFunction(() => !!window.__prepwiseRunner, null, { timeout: 15000 });

  // Same-origin-style fetch from the page, exactly as the app calls the API.
  const getJson = (url) => page.evaluate(async (u) => (await fetch(u, { credentials: 'include' })).json(), url);
  const list = await getJson(`${API}/api/practice/questions?type=coding`);
  const items = (list.questions || []).filter((q) => q.type === 'coding');
  console.log(`${items.length} coding questions in the practice API, ${seed.length} in the seed files`);
  if (items.length !== seed.length) fail(`the practice API lists ${items.length} coding questions but the seed has ${seed.length}`);

  const questions = [];
  for (const item of items) {
    const detail = (await getJson(`${API}/api/practice/questions/${item.id}`)).question;
    const s = seedByTitle.get(detail.title);
    if (!s) { fail(`"${detail.title}" is not in the seed files`); continue; }
    questions.push({ detail, seed: s });
  }

  const run = (args) => page.evaluate((a) => window.__prepwiseRunner.runInBrowser(a), args);
  const count = Object.fromEntries(LANGS.map((l) => [l, { questions: 0, passed: 0, declined: [], failed: [] }]));

  for (const { detail, seed: s } of questions) {
    for (const language of LANGS) {
      const source = s.referenceSolutions?.[language];
      if (!source || !(detail.languages || []).includes(language)) continue;
      const c = count[language];
      c.questions += 1;
      const visible = detail.visibleTests.map((t) => ({ id: t.id, input: t.input, expectedOutput: t.expectedOutput, comparison: t.comparison }));
      const hidden = s.tests.filter((t) => !t.visible).map((t, i) => ({ id: `hidden-${i + 1}`, input: t.input, expectedOutput: t.expectedOutput, comparison: t.comparison || 'trim' }));
      const r = await run({ language, source, tests: [...visible, ...hidden], timeLimitMs: detail.timeLimitMs });
      if (r === null) {
        const why = await page.evaluate((a) => window.__prepwiseRunner.browserRunBlocker(a.language, a.source), { language, source });
        c.declined.push(`${detail.title} (${why || 'output the browser cannot reproduce exactly'})`);
        continue;
      }
      const bad = r.perTest.filter((t) => !t.passed);
      if (r.ranIn !== 'browser' || r.perTest.length !== visible.length + hidden.length) fail(`${language} "${detail.title}": unexpected result shape`);
      else if (bad.length) {
        c.failed.push(detail.title);
        const t = bad[0];
        fail(`${language} "${detail.title}": ${bad.length}/${r.perTest.length} tests failed, first ${t.testId} timedOut=${t.timedOut} stdout=${JSON.stringify(t.stdout.slice(0, 120))} stderr=${JSON.stringify(t.stderr.slice(0, 160))}`);
      } else c.passed += 1;
    }
  }

  for (const language of LANGS) {
    const c = count[language];
    console.log(`${language}: ${c.questions} questions, ${c.passed} passed all tests, ${c.declined.length} declined (server fallback), ${c.failed.length} failed`);
    for (const d of c.declined) console.log(`  declined: ${d}`);
  }
  if (!count.python.passed || !count.javascript.passed) fail('no question ran in the browser for a language');

  // Endless loops end with timedOut inside the limit plus 2 s; Python is warmed up first so loading is not timed.
  const first = questions[0];
  const loops = { javascript: 'while(true){}', python: 'while True: pass' };
  await run({ language: 'python', source: 'print(1)', tests: [{ id: 'w', input: '', expectedOutput: '1' }], timeLimitMs: 2000 });
  for (const language of LANGS) {
    const limit = 1000;
    const t0 = Date.now();
    const r = await run({ language, source: loops[language], tests: [{ id: 'loop', input: '', expectedOutput: '' }], timeLimitMs: limit });
    const took = Date.now() - t0;
    if (!r) fail(`${language} endless loop: the runner declined`);
    else if (!r.perTest[0].timedOut || r.perTest[0].passed) fail(`${language} endless loop did not report timedOut (${JSON.stringify(r.perTest[0])})`);
    else if (took > limit + 2000) fail(`${language} endless loop took ${took} ms, more than ${limit + 2000} ms`);
    else console.log(`PASS  ${language} endless loop: timedOut after ${took} ms (limit ${limit} ms)`);

    // The runner must still work after a stopped run.
    const ref = first.seed.referenceSolutions[language];
    const again = await run({ language, source: ref, tests: first.detail.visibleTests, timeLimitMs: first.detail.timeLimitMs });
    if (!again || again.perTest.some((t) => !t.passed)) fail(`${language}: a normal run after the endless loop failed`);
    else console.log(`PASS  ${language} runs normally after a timed-out run`);

    const wrong = await run({ language, source: language === 'python' ? 'print("definitely wrong")' : 'console.log("definitely wrong")', tests: first.detail.visibleTests, timeLimitMs: first.detail.timeLimitMs });
    if (!wrong) fail(`${language} wrong solution: the runner declined`);
    else if (wrong.perTest.some((t) => t.passed)) fail(`${language} wrong solution passed a test`);
    else console.log(`PASS  ${language} wrong solution fails every test`);
  }
  if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);
} catch (e) {
  fail(`check crashed: ${e?.stack || e}`);
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
