// Usage: node shot.mjs <path> <out.png> [--width 1440] [--height 900] [--full] [--role admin|lecturer|student|careers|adminB] [--base http://localhost:5180] [--wait ms] [--scroll px]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const [rawPath, out] = args;
// Git Bash rewrites "/login" into "C:/Program Files/Git/login"; undo that, then normalise the leading slash.
const urlPath = '/' + String(rawPath).replace(/^[A-Za-z]:[\\/]Program Files[\\/]Git/, '').replace(/^\/+/, '');
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const width = +opt('width', 1440), height = +opt('height', 900), base = opt('base', 'http://localhost:5180'), role = opt('role', ''), wait = +opt('wait', 900), scroll = +opt('scroll', 0);
const full = args.includes('--full');
// Fixed demo logins seeded by `npm run dev:local` (local demo data only).
const ROLES = {
  admin: ['admin@email.com', 'admin@123'],
  lecturer: ['lecturer@email.com', 'lecturer@123'],
  careers: ['careers@email.com', 'careers@123'],
  student: ['student@email.com', 'student@123'],
  adminB: ['admin@demo-b.test', 'admin@123'],
};
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
if (role) {
  const [email, password] = ROLES[role];
  const r = await ctx.request.post(base + '/api/auth/login', { data: { email, password } });
  if (!r.ok()) { console.error('login failed', r.status()); process.exit(2); }
}
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto(base + urlPath, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => errors.push('goto: ' + e.message));
await page.waitForTimeout(wait);
if (scroll) { await page.evaluate((y) => window.scrollTo(0, y), scroll); await page.waitForTimeout(700); }
if (full) { // scroll through so reveal animations trigger
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += Math.max(400, height / 2)) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(250); }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
}
await page.screenshot({ path: out, fullPage: full });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(JSON.stringify({ out, url: page.url(), horizontalOverflow: overflow, errors: errors.slice(0, 6) }));
await browser.close();
