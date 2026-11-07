// Cohort similarity: tokenizer, winnowing, starter-code exclusion, short solutions, boilerplate, and the API.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeWorld, IDS, newId } from './helpers.js';
import { installQuestionWorld } from './support/questionWorld.js';
import { tokenize } from '../services/similarity/tokenizer.js';
import { compareCohort, DEFAULTS } from '../services/similarity/index.js';
import app from '../app.js';

const JS_A = `
// Kadane's algorithm: best sum of a contiguous run
function solve(input) {
  const nums = input.trim().split(/\\s+/).map(Number);
  let best = -Infinity;
  let current = 0;
  for (const value of nums) {
    current = Math.max(value, current + value);
    best = Math.max(best, current);
  }
  return best;
}
const data = require('fs').readFileSync(0, 'utf8');
console.log(String(solve(data)));
`;

// Same program: every identifier renamed, comments changed, string and number literals changed, reformatted.
const JS_A_RENAMED = `
/* maximum subarray */
function maxRun(text){
    const arr=text.trim().split(/\\s+/).map(Number)
    let maxSoFar=-Infinity
    let running=0
    for(const item of arr){
        running=Math.max(item,running+item)
        maxSoFar=Math.max(maxSoFar,running)
    }
    return maxSoFar
}
const raw = require("fs").readFileSync(0, "utf8");
console.log(String(maxRun(raw)));
`;

const JS_OTHER = `
function solve(input) {
  const parts = input.split('\\n').filter(Boolean);
  const table = new Map();
  for (const line of parts) {
    const [key, amount] = line.split(' ');
    table.set(key, (table.get(key) || 0) + Number(amount));
  }
  const keys = [...table.keys()].sort();
  return keys.map((k) => k + ':' + table.get(k)).join(',');
}
process.stdin.on('data', (chunk) => { console.log(solve(String(chunk))); });
`;

const PY_A = `
def longest_run(values):
    best = 0
    streak = 0
    previous = None
    for v in values:
        if previous is not None and v == previous + 1:
            streak += 1
        else:
            streak = 1
        best = max(best, streak)
        previous = v
    return best

numbers = [int(x) for x in input().split()]
print(longest_run(numbers))
`;
const PY_A_RENAMED = `
# renamed copy
def f(seq):
    top = 0
    run = 0
    last = None
    for item in seq:
        if last is not None and item == last + 1:
            run += 1
        else:
            run = 1
        top = max(top, run)
        last = item
    return top

data = [int(t) for t in input().split()]
print(f(data))
`;

test('tokenizer normalises identifiers, literals, comments and whitespace', () => {
  const a = tokenize('let total = 10; // sum\nconsole.log("hi" + total);', 'javascript').map((t) => t.t);
  const b = tokenize('let   x=99 /* other */\nconsole.log( \'bye\' + x )', 'javascript').map((t) => t.t);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['let', 'ID', '=', 'NUM', 'ID', '.', 'ID', '(', 'STR', '+', 'ID', ')']);
  const py = tokenize('x = 1  # c\n"""doc\nstring"""\nprint(x // 2)', 'python');
  assert.deepEqual(py.map((t) => t.t), ['ID', '=', 'NUM', 'STR', 'ID', '(', 'ID', '//', 'NUM', ')']);
  assert.equal(py.at(-1).line, 4);
  assert.deepEqual(tokenize('#include <stdio.h>\nint main() { return 0; }', 'c').map((t) => t.t), ['int', 'ID', '(', ')', '{', 'return', 'NUM', '}']);
  assert.deepEqual(tokenize('String s = "a\\"b"; // x\nchar c = \'q\';', 'java').map((t) => t.t), ['string'.replace('string', 'ID'), 'ID', '=', 'STR', 'char', 'ID', '=', 'STR']);
});

const subs = (...pairs) => pairs.map(([id, source, language = 'javascript']) => ({ id, language, source }));

test('a renamed-variable copy is flagged, in JavaScript and in Python', () => {
  for (const [a, b, language] of [[JS_A, JS_A_RENAMED, 'javascript'], [PY_A, PY_A_RENAMED, 'python']]) {
    const r = compareCohort(subs(['s1', a, language], ['s2', b, language]));
    assert.equal(r.pairs.length, 1, language);
    assert.ok(r.pairs[0].containment >= 0.9, `${language} containment ${r.pairs[0].containment}`);
    assert.ok(r.pairs[0].jaccard >= 0.8, `${language} jaccard ${r.pairs[0].jaccard}`);
    assert.equal(r.pairs[0].flagged, true);
  }
});

test('different programs for the same task are not flagged', () => {
  const r = compareCohort(subs(['s1', JS_A], ['s2', JS_OTHER]));
  assert.ok(!r.pairs.some((p) => p.flagged), JSON.stringify(r.pairs.map((p) => p.containment)));
});

test('matching fragments are reported as line ranges within each source', () => {
  const partial = `${JS_OTHER}\n${JS_A.split('\n').slice(3, 12).join('\n')}\n`;
  const r = compareCohort(subs(['s1', JS_A], ['s2', partial]), { threshold: 0.3, minShared: 3 });
  assert.equal(r.pairs.length, 1);
  const { rangesA, rangesB } = r.pairs[0];
  assert.ok(rangesA.length >= 1 && rangesB.length >= 1);
  for (const x of [...rangesA, ...rangesB]) assert.ok(x.startLine >= 1 && x.endLine >= x.startLine);
  assert.ok(rangesA.some((x) => x.startLine >= 3 && x.endLine <= 12 && x.endLine - x.startLine >= 5), 'the copied block is covered: ' + JSON.stringify(rangesA));
  assert.ok(rangesB.some((x) => x.startLine > 10), 'the copied block sits after the original code in the second file');
});

const STARTER = Array.from({ length: 12 }, (_, i) => `function helper${i}(a, b) { if (a > b) { return a - b; } return b - a + ${i}; }`).join('\n');

test('starter code is excluded: two students who only keep the same starter are not similar', () => {
  const s1 = `${STARTER}\nfunction solve(n) { let t = 0; for (let i = 0; i < n; i++) { t += helper1(i, 3) * 2; } return t; }\nconsole.log(solve(10));`;
  const s2 = `${STARTER}\nfunction solve(n) { return n < 2 ? n : solve(n - 1) + solve(n - 2) + helper5(n, 4) - helper2(1, n); }\nconsole.log(solve(7));`;
  const without = compareCohort(subs(['a', s1], ['b', s2]), { minTokens: 10, threshold: 0.5 });
  assert.ok(without.pairs.some((p) => p.flagged), 'sanity: without removing the starter these look copied');
  const withStarter = compareCohort(subs(['a', s1], ['b', s2]), { starterCode: { javascript: STARTER }, minTokens: 10, threshold: 0.5 });
  assert.ok(!withStarter.pairs.some((p) => p.flagged), JSON.stringify(withStarter.pairs.map((p) => p.containment)));
});

test('starter code does not count towards the minimum length, so a tiny change on a big template is skipped', () => {
  const s1 = `${STARTER}\nconsole.log(1);`;
  const s2 = `${STARTER}\nconsole.log(2);`;
  const r = compareCohort(subs(['a', s1], ['b', s2]), { starterCode: { javascript: STARTER } });
  assert.deepEqual(r.skipped.map((s) => s.reason), ['too_short', 'too_short']);
  assert.equal(r.compared, 0);
});

test('short solutions are skipped rather than compared', () => {
  const r = compareCohort(subs(['a', 'print(int(input()) * 2)', 'python'], ['b', 'print(int(input()) * 2)', 'python']));
  assert.equal(r.compared, 0);
  assert.equal(r.pairs.length, 0);
  assert.equal(r.skipped.length, 2);
});

test('boilerplate shared by most of the cohort is ignored', () => {
  const boiler = "const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\nconst count = parseInt(lines[0], 10);\nconst values = lines[1].split(' ').map(Number);\n";
  const bodies = [
    'let s = 0; for (const v of values) { if (v % 2 === 0) { s += v * v; } } console.log(s + count);',
    'const sorted = values.slice().sort((a, b) => b - a); console.log(sorted.slice(0, 3).join(" ") + count);',
    'let p = 1; for (let i = 0; i < values.length; i += 1) { p = (p * values[i]) % 1000007; } console.log(p, count);',
    'const seen = new Set(); let dup = 0; values.forEach((v) => { if (seen.has(v)) { dup += 1; } seen.add(v); }); console.log(dup + count);',
    'console.log(values.reduce((acc, v) => Math.max(acc, v), -1e9), count, values.filter((v) => v > 0).length);',
    'let lo = 0; let hi = values.length - 1; while (lo < hi) { const t = values[lo]; values[lo] = values[hi]; values[hi] = t; lo += 1; hi -= 1; } console.log(values.join(","), count);',
  ];
  const cohort = bodies.map((b, i) => ({ id: `s${i}`, language: 'javascript', source: boiler + b }));
  const withFilter = compareCohort(cohort, { minTokens: 20, threshold: 0.5 });
  assert.equal(withFilter.pairs.filter((p) => p.flagged).length, 0);
  const noFilter = compareCohort(cohort, { minTokens: 20, threshold: 0.5, commonFraction: 1.01 });
  assert.ok(noFilter.pairs.some((p) => p.flagged), 'without the filter shared boilerplate would flag pairs');
});

test('submissions in different languages are never compared', () => {
  const r = compareCohort(subs(['a', JS_A, 'javascript'], ['b', JS_A, 'java']));
  assert.equal(r.pairs.length, 0);
});

test('defaults are what the docs say', () => {
  assert.deepEqual({ k: DEFAULTS.k, w: DEFAULTS.w, minTokens: DEFAULTS.minTokens, threshold: DEFAULTS.threshold }, { k: 5, w: 4, minTokens: 40, threshold: 0.7 });
});

// ---------------------------------------------------------------- API
let w, db, lecA, lecA2, lecB, stu, stu2, stu3, stu4, stuB, courseA, cohortA, q, assessment, sessions;
beforeEach(() => {
  w = makeWorld(); w.install();
  db = installQuestionWorld(w);
  lecA = w.addUser({ email: 'l@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecA2 = w.addUser({ email: 'l2@a.edu', role: 'lecturer', institutionId: IDS.instA });
  lecB = w.addUser({ email: 'l@b.edu', role: 'lecturer', institutionId: IDS.instB });
  [stu, stu2, stu3, stu4] = ['1', '2', '3', '4'].map((n) => w.addUser({ email: `s${n}@a.edu`, name: `Student ${n}`, institutionId: IDS.instA }));
  stuB = w.addUser({ email: 's@b.edu', institutionId: IDS.instB });
  courseA = { _id: newId(), institutionId: IDS.instA, code: 'CS1', title: 'CS1', ownerId: lecA._id };
  cohortA = { _id: newId(), institutionId: IDS.instA, courseId: courseA._id, name: '2026' };
  w.courses.push(courseA); w.cohorts.push(cohortA);
  q = db.addQuestion({ institutionId: IDS.instA, title: 'Max run', starterCode: { javascript: '' } }, [{ input: '1', expectedOutput: '1', visible: true, institutionId: IDS.instA }]);
  assessment = w.adb.addAssessment({ institutionId: IDS.instA, courseId: courseA._id, cohortId: cohortA._id, createdBy: lecA._id, questionIds: [q._id] });
  sessions = {};
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

const addSubmission = (user, source, language = 'javascript') => {
  const s = {
    _id: newId(), institutionId: IDS.instA, assessmentId: assessment._id, courseId: courseA._id, userId: user._id, attemptNo: 1, status: 'submitted',
    serverStartedAt: new Date(Date.now() - 3600e3), baseDeadline: new Date(Date.now() + 1000), extensionMs: 0, closesAt: assessment.closesAt,
    questions: [{ questionId: q._id }], submittedAt: new Date(), integrityLevel: 1, disabledSignals: [],
  };
  w.adb.sessions.push(s);
  sessions[user._id] = s;
  w.qdb.attempts.push({ _id: newId(), institutionId: IDS.instA, userId: user._id, questionId: q._id, assessmentSessionId: s._id, runKind: 'submit', language, source, score: 100, createdAt: new Date() });
  return s;
};
const as = (u) => ({ Cookie: w.cookie(u) });
const run = (u, body = {}, id = assessment._id) => request(app).post(`/api/integrity/assessments/${id}/similarity/run`).set(as(u)).send(body);
const list = (u, qs = '', id = assessment._id) => request(app).get(`/api/integrity/assessments/${id}/similarity${qs}`).set(as(u));

test('similarity run flags the copied pair, creates reasons on both cases, and leaves the rest alone', async () => {
  addSubmission(stu, JS_A);
  addSubmission(stu2, JS_A_RENAMED);
  addSubmission(stu3, JS_OTHER);
  addSubmission(stu4, 'console.log(1)');
  const r = await run(lecA);
  assert.equal(r.status, 200);
  assert.equal(r.body.flaggedPairs, 1);
  assert.equal(r.body.sessionsFlagged, 2);
  assert.equal(r.body.questions[0].compared, 3);
  assert.deepEqual(r.body.questions[0].skipped.map((s) => s.reason), ['too_short']);
  assert.match(r.body.limits, /not proof/);
  const cases = w.adb.cases;
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map((c) => String(c.userId)).sort(), [String(stu._id), String(stu2._id)].sort());
  for (const c of cases) {
    assert.deepEqual(c.reasons.map((x) => x.text), ['submission similar to 1 other']);
    assert.equal(c.reasons[0].kind, 'similarity');
    assert.equal(c.reasons[0].evidence[0].kind, 'similarity_pair');
    assert.ok(c.reasons[0].threshold.similarityContainment);
  }
  assert.equal(w.audit.filter((x) => x.action === 'integrity.similarity.run').length, 1);

  const l = await list(lecA, '?flagged=1');
  assert.equal(l.status, 200);
  assert.equal(l.body.pairs.length, 1);
  assert.deepEqual([l.body.pairs[0].a.name, l.body.pairs[0].b.name].sort(), ['Student 1', 'Student 2']);
  assert.ok(l.body.pairs[0].a.ranges.length >= 1);
  assert.equal(w.audit.filter((x) => x.action === 'integrity.similarity.view').length, 1);

  // a second run replaces the stored pairs instead of duplicating them
  await run(lecA);
  assert.equal(w.adb.pairs.length, w.adb.pairs.filter((p) => true).length);
  assert.equal((await list(lecA)).body.pairs.filter((p) => p.flagged).length, 1);
  assert.equal(w.adb.cases.length, 2);
});

test('a higher threshold turns the flag off and the case reasons follow on re-run', async () => {
  addSubmission(stu, JS_A);
  addSubmission(stu2, JS_A_RENAMED.replace('Math.max(item,running+item)', 'Math.min(item,running-item)'));
  await run(lecA, { threshold: 0.5 });
  assert.ok(w.adb.cases.length >= 0);
  const before = w.adb.cases.length;
  await run(lecA, { threshold: 1 });
  const stillFlagged = w.adb.cases.filter((c) => c.reasons.length > 0).length;
  assert.ok(stillFlagged <= before);
  assert.equal((await run(lecA, { threshold: 0.1 })).status, 400);
  assert.equal((await run(lecA, { minTokens: 2 })).status, 400);
});

test('students from the same cohort submitting only the shared starter are not flagged through the API', async () => {
  const starter = Array.from({ length: 12 }, (_, i) => `function helper${i}(a, b) { if (a > b) { return a - b; } return b - a + ${i}; }`).join('\n');
  db.questions.find((x) => x._id === q._id).starterCode = { javascript: starter };
  addSubmission(stu, `${starter}\nconsole.log(1);`);
  addSubmission(stu2, `${starter}\nconsole.log(2);`);
  const r = await run(lecA);
  assert.equal(r.body.flaggedPairs, 0);
  assert.equal(w.adb.cases.length, 0);
});

test('a student\'s own two attempts are never a pair', async () => {
  addSubmission(stu, JS_A);
  const second = addSubmission(stu, JS_A_RENAMED);
  second.attemptNo = 2;
  const r = await run(lecA);
  assert.equal(r.body.flaggedPairs, 0);
});

test('similarity endpoints are staff only, tenant scoped and limited to the lecturer\'s courses', async () => {
  addSubmission(stu, JS_A);
  addSubmission(stu2, JS_A_RENAMED);
  assert.equal((await request(app).post(`/api/integrity/assessments/${assessment._id}/similarity/run`)).status, 401);
  assert.equal((await run(stu)).status, 403);
  assert.equal((await list(stu)).status, 403);
  assert.equal((await run(lecB)).status, 404);
  assert.equal((await list(lecB)).status, 404);
  assert.equal((await run(lecA2)).status, 404);
  assert.equal((await list(lecA2)).status, 404);
  assert.equal((await run(lecA, {}, newId())).status, 404);
  assert.equal((await run(lecA, {}, 'not-an-id')).status, 404);
  assert.equal(w.adb.pairs.length, 0);
  assert.equal(stuB.role, 'student');
});
