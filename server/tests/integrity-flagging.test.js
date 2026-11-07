// Pure flagging rules: reasons with evidence and thresholds, technical events excluded, no scores anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFlags, fmtClock, fmtDuration } from '../services/integrity/flagging.js';
import { mergeTimeline } from '../services/integrity/timeline.js';

const S = 1000;
let n = 0;
const E = (type, t, extra = {}) => ({ _id: `e${++n}`, type, t, technical: type.startsWith('network_'), ...extra });
const hiddenFor = (start, secs) => [E('tab_hidden', start), E('tab_visible', start + secs * S)];

// Walks a value and returns every key found, to prove nothing score-like exists in the output.
const keysOf = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
};
const FORBIDDEN_KEY = /score|penalt|deduct|risk|probab|rank|verdict|grade|mark(?!er)/i;

test('formatting helpers', () => {
  assert.equal(fmtClock(843 * S), '00:14:03');
  assert.equal(fmtDuration(252 * S), '4m12s');
  assert.equal(fmtDuration(45 * S), '45s');
  assert.equal(fmtDuration(3725 * S), '1h02m05s');
});

test('left the page: reason text, measurement, threshold and evidence', () => {
  const events = [];
  const lens = [30, 40, 50, 30, 60, 42]; // 252 s = 4m12s
  lens.forEach((secs, i) => events.push(...hiddenFor(100 * S * (i + 1), secs)));
  const { reasons } = deriveFlags({ events, sessionEndMs: 1000 * S });
  const r = reasons.find((x) => x.code === 'left_page');
  assert.equal(r.text, 'left the page 6 times for a total of 4m12s');
  assert.equal(r.measured.count, 6);
  assert.equal(r.threshold.leftPageCount, 5);
  assert.equal(r.evidence.length, 6);
  assert.ok(r.evidence.every((e) => e.kind === 'integrity_event' && e.id && Number.isFinite(e.at)));
});

test('below the thresholds nothing is flagged; per-assessment thresholds change the outcome', () => {
  const events = [];
  for (let i = 0; i < 6; i += 1) events.push(...hiddenFor(100 * S * (i + 1), 5));
  assert.equal(deriveFlags({ events, sessionEndMs: 900 * S }).reasons.filter((r) => r.code === 'left_page').length, 1);
  assert.equal(deriveFlags({ events, sessionEndMs: 900 * S, thresholds: { leftPageCount: 10 } }).reasons.length, 0);
  assert.equal(deriveFlags({ events: hiddenFor(10 * S, 20), sessionEndMs: 900 * S }).reasons.length, 0);
  assert.equal(deriveFlags({ events: hiddenFor(10 * S, 20), sessionEndMs: 900 * S, thresholds: { leftPageTotalSeconds: 10, leftPageCount: 50 } }).reasons.length, 1);
});

test('a tab hidden at the end of the session counts until the session ended', () => {
  const { reasons } = deriveFlags({ events: [E('tab_hidden', 100 * S)], sessionEndMs: 400 * S });
  assert.equal(reasons[0].text, 'left the page 1 time for a total of 5m00s');
  assert.equal(reasons[0].evidence[0].unfinished, true);
});

test('large paste: the example sentence, and small pastes or pastes outside the editor are ignored', () => {
  const events = [E('paste', 843 * S, { len: 1840, inEditor: true }), E('paste', 10 * S, { len: 90, inEditor: true }), E('paste', 20 * S, { len: 9000, inEditor: false })];
  const { reasons } = deriveFlags({ events, sessionEndMs: 2000 * S });
  assert.deepEqual(reasons.map((r) => r.text), ['pasted 1,840 characters in one event at 00:14:03']);
  assert.equal(reasons[0].threshold.pasteChars, 500);
});

test('a paste seen by both the browser and the editor is one reason with both pieces of evidence', () => {
  const start = Date.parse('2026-01-01T10:00:00Z');
  const batch = { _id: 'b1', questionId: 'q1', createdAt: new Date(start + 845 * S), events: [{ t: 100, type: 'insert', len: 1 }, { t: 2100, type: 'paste', len: 1840 }] };
  const events = [E('paste', 843 * S, { len: 1840, inEditor: true, questionId: 'q1' })];
  const { reasons } = deriveFlags({ events, batches: [batch], sessionStartMs: start, sessionEndMs: 2000 * S });
  assert.equal(reasons.length, 1);
  assert.deepEqual(reasons[0].evidence.map((e) => e.kind).sort(), ['edit_batch', 'integrity_event']);
});

test('typing speed jump is derived from edit batches, with the batch as evidence', () => {
  const start = Date.parse('2026-01-01T10:00:00Z');
  const batches = [];
  const typed = (minute, chars, id) => batches.push({
    _id: id, questionId: 'q1', createdAt: new Date(start + (minute * 60 + 59) * S),
    events: Array.from({ length: chars }, (_, i) => ({ t: minute * 60000 + 100 + i * 5, type: 'insert', len: 1 })),
  });
  [1, 2, 3, 4, 5].forEach((m, i) => typed(m, 60, `slow${i}`));
  typed(8, 900, 'fast');
  const { reasons } = deriveFlags({ batches, sessionStartMs: start, sessionEndMs: 20 * 60 * S });
  const r = reasons.find((x) => x.code === 'typing_speed');
  assert.ok(r, 'expected a typing speed reason');
  assert.match(r.text, /^typing speed jumped to about 900 characters\/minute at 00:08:00 \(typical for this session: 60\)$/);
  assert.deepEqual(r.evidence.map((e) => e.id), ['fast']);
  const steady = [1, 2, 3, 4, 5, 6].map((m) => ({ _id: `s${m}`, questionId: 'q', createdAt: new Date(start + (m * 60 + 59) * S), events: Array.from({ length: 80 }, (_, i) => ({ t: m * 60000 + 100 + i, type: 'insert', len: 1 })) }));
  assert.equal(deriveFlags({ batches: steady, sessionStartMs: start, sessionEndMs: 900 * S }).reasons.length, 0);
});

test('hints from the browser are labelled low confidence; fullscreen exits and clipboard volume are reasons', () => {
  const events = [E('devtools_hint', 5 * S), E('multiple_screens_hint', 6 * S), E('fullscreen_exit', 7 * S), E('fullscreen_exit', 8 * S), E('fullscreen_exit', 9 * S)];
  for (let i = 0; i < 15; i += 1) events.push(E(i % 2 ? 'copy' : 'cut', (20 + i) * S));
  const { reasons } = deriveFlags({ events, sessionEndMs: 600 * S });
  assert.deepEqual(reasons.map((r) => r.code).sort(), ['clipboard_out', 'devtools_hint', 'fullscreen_exit', 'multiple_screens_hint']);
  assert.ok(reasons.filter((r) => r.kind === 'hint').every((r) => /low confidence/.test(r.text)));
});

test('technical events (offline / online) are excluded from reasons by default and summarised separately', () => {
  const events = [];
  for (let i = 0; i < 10; i += 1) events.push(E('network_offline', (100 + i * 50) * S), E('network_online', (120 + i * 50) * S));
  const quiet = deriveFlags({ events, sessionEndMs: 900 * S });
  assert.deepEqual(quiet.reasons, []);
  assert.equal(quiet.technical.offlineCount, 10);
  assert.equal(quiet.technical.offlineMs, 200 * S);
  const loud = deriveFlags({ events, sessionEndMs: 900 * S, includeTechnical: true });
  assert.equal(loud.reasons.length, 1);
  assert.equal(loud.reasons[0].kind, 'technical');
  assert.match(loud.reasons[0].text, /\[technical\]$/);
});

test('technical events never inflate the left-the-page count', () => {
  const events = [];
  for (let i = 0; i < 20; i += 1) events.push(E('network_offline', i * 20 * S), E('network_online', (i * 20 + 5) * S));
  assert.deepEqual(deriveFlags({ events, sessionEndMs: 900 * S }).reasons, []);
});

test('similarity reasons name a count, not a verdict', () => {
  const sim = [
    { id: 'p1', flagged: true, questionId: 'q1', containment: 0.91, threshold: 0.7, otherUserId: 'u2' },
    { id: 'p2', flagged: true, questionId: 'q1', containment: 0.8, threshold: 0.7, otherUserId: 'u3' },
    { id: 'p3', flagged: true, questionId: 'q2', containment: 0.85, threshold: 0.7, otherUserId: 'u3' },
  ];
  const { reasons } = deriveFlags({ similarity: sim });
  assert.equal(reasons[0].text, 'submission similar to 2 others');
  assert.equal(reasons[0].evidence.length, 3);
  assert.equal(deriveFlags({ similarity: [{ ...sim[0], otherUserId: 'u2' }] }).reasons[0].text, 'submission similar to 1 other');
});

test('every reason has text, a measurement, a threshold and evidence; the output has no score-like field', () => {
  const events = [E('paste', 5 * S, { len: 900, inEditor: true }), E('devtools_hint', 6 * S), E('fullscreen_exit', 1), E('fullscreen_exit', 2), E('fullscreen_exit', 3)];
  for (let i = 0; i < 7; i += 1) events.push(...hiddenFor(100 * S * (i + 1), 10));
  const out = deriveFlags({ events, sessionEndMs: 900 * S, includeTechnical: true, similarity: [{ id: 'p', flagged: true, questionId: 'q', containment: 0.9, threshold: 0.7, otherUserId: 'u' }] });
  assert.ok(out.reasons.length >= 4);
  for (const r of out.reasons) {
    assert.ok(r.text && r.code && r.kind, 'text, code and kind');
    assert.ok(r.measured && Object.keys(r.measured).length, `${r.code} measured`);
    assert.ok(r.threshold && typeof r.threshold === 'object', `${r.code} threshold`);
    assert.ok(Array.isArray(r.evidence) && r.evidence.length, `${r.code} evidence`);
  }
  assert.deepEqual(Object.keys(out).sort(), ['reasons', 'technical']);
  const bad = [...keysOf(out)].filter((k) => FORBIDDEN_KEY.test(k));
  assert.deepEqual(bad, []);
});

test('timeline merges integrity events, edit batches and attempts in order', () => {
  const start = Date.parse('2026-01-01T10:00:00Z');
  const session = { serverStartedAt: new Date(start), baseDeadline: new Date(start + 3600 * S), extensionMs: 0, submittedAt: new Date(start + 3000 * S) };
  const events = [{ _id: 'i1', type: 'tab_hidden', t: 500 * S, technical: false }, { _id: 'i2', type: 'network_offline', t: 100 * S, technical: true }];
  const batches = [{ _id: 'b1', questionId: 'q1', createdAt: new Date(start + 305 * S), events: [{ t: 0, type: 'insert', len: 1 }, { t: 5000, type: 'paste', len: 40 }] }];
  const attempts = [{ _id: 'a1', questionId: 'q1', runKind: 'submit', verdict: 'accepted', createdAt: new Date(start + 400 * S), score: 100 }, { _id: 'd', runKind: 'draft', questionId: 'q1', createdAt: new Date(start) }];
  const t = mergeTimeline({ session, events, batches, attempts });
  assert.deepEqual(t.items.map((i) => `${i.kind}:${i.type || ''}`), ['session:started', 'integrity:network_offline', 'editing:', 'attempt:submit', 'integrity:tab_hidden', 'session:submitted', 'session:deadline']);
  assert.equal(t.items.find((i) => i.kind === 'integrity' && i.type === 'network_offline').technical, true);
  const edit = t.items.find((i) => i.kind === 'editing');
  assert.equal(edit.until, 305 * S);
  assert.equal(edit.at, 300 * S);
  assert.equal(edit.pasted, 40);
  assert.ok(!keysOf(t).has('score'), 'attempt scores are not part of the integrity timeline');
});
