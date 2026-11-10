// Unit tests: CSV parser, scoped(), requireRole, AI usage cap, script helpers, source tree rules.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './helpers.js';
import { parseCsv, parseUsersCsv } from '../modules/people/people.csv.js';
import { scoped, TenantError, runWithTenant, currentInstitutionId } from '../middleware/tenancy.js';
import requireRole from '../middleware/requireRole.js';
import { consumeAi, usageRepo, AiLimitError, resetAiCapCache, currentMonth } from '../services/aiUsage.js';
import { parseCreateArgs } from '../scripts/create-institution.js';
import { toCsv } from '../scripts/usage-report.js';
import { randomPassword, studentNames, DEMOS } from '../scripts/seed-demo.js';
import { slugify } from '../scripts/_db.js';

afterEach(() => { mock.restoreAll(); resetAiCapCache(); });

test('csv parser handles BOM, CRLF, quotes, embedded commas and newlines', () => {
  const rows = parseCsv('﻿email,name\r\na@x.edu,"Doe, ""J"""\r\n\r\nb@x.edu,"two\nlines"\r\n');
  assert.deepEqual(rows, [['email', 'name'], ['a@x.edu', 'Doe, "J"'], ['b@x.edu', 'two\nlines']]);
});

test('users csv: header is case-insensitive, role defaults to student, lines match the spreadsheet', () => {
  const r = parseUsersCsv('Name,EMAIL,Role\nAda,ADA@X.EDU,\nBob,bob@x.edu,Lecturer\n');
  assert.deepEqual(r.rows.map((x) => [x.line, x.email, x.role]), [[2, 'ada@x.edu', 'student'], [3, 'bob@x.edu', 'lecturer']]);
  assert.ok(parseUsersCsv('name\nx').error);
  assert.ok(parseUsersCsv('').error);
});

test('scoped() fails closed without an institution', () => {
  assert.deepEqual(scoped({ user: { institutionId: 'i1' } }, { role: 'student' }), { role: 'student', institutionId: 'i1' });
  assert.throws(() => scoped({ user: {} }), TenantError);
  assert.throws(() => scoped({}), TenantError);
  assert.throws(() => scoped({ user: { institutionId: undefined } }), TenantError);
});

test('scoped() cannot be overridden by the extra filter', () => {
  assert.equal(scoped({ user: { institutionId: 'i1' } }, { institutionId: 'other' }).institutionId, 'i1');
});

test('requireRole is default-deny', () => {
  const run = (mw, user) => {
    let status; let nexted = false;
    const res = { status(s) { status = s; return this; }, json() { return this; } };
    mw({ user }, res, () => { nexted = true; });
    return { status, nexted };
  };
  assert.equal(run(requireRole(), { role: 'university_admin' }).nexted, false);
  assert.equal(run(requireRole('lecturer'), { role: 'student' }).status, 403);
  assert.equal(run(requireRole('lecturer'), {}).status, 403);
  assert.equal(run(requireRole('lecturer'), undefined).status, 401);
  assert.equal(run(requireRole('lecturer', 'university_admin'), { role: 'lecturer' }).nexted, true);
});

test('tenant context reaches code with no request object', async () => {
  assert.equal(currentInstitutionId(), null);
  await runWithTenant('inst-1', async () => {
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(currentInstitutionId(), 'inst-1');
  });
});

test('consumeAi counts calls and throws a typed error past the monthly cap', async () => {
  let calls = 0;
  mock.method(usageRepo, 'getCap', async () => 3);
  mock.method(usageRepo, 'increment', async (id, month) => { assert.equal(month, currentMonth()); return { calls: ++calls }; });
  await consumeAi('inst-1');
  await consumeAi('inst-1');
  await consumeAi('inst-1');
  await assert.rejects(() => consumeAi('inst-1'), (e) => e instanceof AiLimitError && e.code === 'AI_MONTHLY_CAP' && e.status === 429 && e.cap === 3);
});

test('consumeAi uses the default cap of 20000 when the institution has none stored', async () => {
  mock.method(usageRepo, 'getCap', async () => undefined);
  mock.method(usageRepo, 'increment', async () => ({ calls: 20000 }));
  await consumeAi('inst-2');
  usageRepo.increment.mock.restore();
  mock.method(usageRepo, 'increment', async () => ({ calls: 20001 }));
  await assert.rejects(() => consumeAi('inst-2'), AiLimitError);
});

test('consumeAi takes the institution from the request context and is a no-op without one', async () => {
  const seen = [];
  mock.method(usageRepo, 'getCap', async () => 10);
  mock.method(usageRepo, 'increment', async (id) => { seen.push(id); return { calls: 1 }; });
  await consumeAi();
  assert.deepEqual(seen, []);
  await runWithTenant('inst-9', () => consumeAi());
  assert.deepEqual(seen, ['inst-9']);
});

test('consumeAi lets the call through if the usage store is down', async () => {
  mock.method(usageRepo, 'getCap', async () => 10);
  mock.method(usageRepo, 'increment', async () => { throw new Error('db down'); });
  mock.method(console, 'error', () => {});
  await consumeAi('inst-3');
});

test('create-institution arguments are validated and normalised', () => {
  const a = parseCreateArgs(['--name', 'Example University', '--limit', '200', '--domains', '@Example.edu, students.example.edu', '--admin-email', 'Admin@Example.edu', '--admin-name', 'Ada']);
  assert.equal(a.slug, 'example-university');
  assert.deepEqual(a.allowedEmailDomains, ['example.edu', 'students.example.edu']);
  assert.equal(a.adminEmail, 'admin@example.edu');
  assert.equal(a.contractedStudentLimit, 200);
  assert.throws(() => parseCreateArgs(['--name', 'X']), /Missing/);
  assert.throws(() => parseCreateArgs(['--name', 'X', '--limit', 'ten', '--admin-email', 'a@b.cd', '--admin-name', 'A']), /whole number/);
  assert.equal(slugify('  St. Mary\'s  College! '), 'st-mary-s-college');
});

test('usage report CSV quotes awkward values', () => {
  const csv = toCsv([{ institution: 'A, "B"', slug: 'ab', status: 'active', activeStudents: 3, invitedStudents: 1, studentLimit: 10, aiCallsThisMonth: 5, aiCallCap: 20000, contractEnd: '' }]);
  assert.equal(csv.split('\n')[1], '"A, ""B""",ab,active,3,1,10,5,20000,');
});

test('seed helpers produce valid fake data', () => {
  assert.equal(DEMOS.length, 2);
  assert.ok(DEMOS.every((d) => d.domain.endsWith('.test')));
  const pw = randomPassword();
  assert.match(pw, /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/);
  assert.notEqual(pw, randomPassword());
  const names = studentNames(40);
  assert.equal(names.length, 40);
  assert.equal(new Set(names.map((n) => `${n.first} ${n.last}`)).size, 40);
});

test('seed-demo.js checks NODE_ENV before connecting to anything', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '../scripts/seed-demo.js'), 'utf8');
  const guard = src.indexOf("NODE_ENV === 'production'");
  assert.ok(guard > -1);
  assert.ok(guard < src.indexOf('await connect()'), 'the guard comes before the connection');
});
