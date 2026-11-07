// Pure flagging: turns raw evidence into a list of human-readable REASONS a person can look at.
//
// Design rules (do not weaken):
//  - Output is reasons, never a single verdict, probability or "risk score". There is no number that ranks students.
//  - Nothing here changes a mark. This module has no access to scores and returns nothing that could be used as a penalty.
//  - Every reason says what was measured, which threshold it passed, and which stored evidence supports it.
//  - Connectivity events (offline / online) are technical, not behavioural: summarised separately and excluded from
//    reasons unless the caller asks for them (and then labelled kind "technical").
import { DEFAULT_THRESHOLDS } from './thresholds.js';

const pad = (n) => String(n).padStart(2, '0');
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
export const fmtDuration = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h${pad(m)}m${pad(sec)}s`;
  if (m) return `${m}m${pad(sec)}s`;
  return `${sec}s`;
};
const times = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const num = (n) => Number(n).toLocaleString('en-US');
const idOf = (d) => (d?._id != null ? String(d._id) : undefined);
const ev = (e, extra = {}) => ({ kind: 'integrity_event', id: idOf(e), type: e.type, at: e.t, ...extra });

// Absolute position (ms since the session started) of an edit event. Batches carry t relative to the start of the
// editing session; the batch's createdAt is when the last event was flushed, so the batch is anchored to it.
export const editEventAt = (batch, event, sessionStartMs) => {
  const lastT = Math.max(...(batch.events || []).map((x) => x.t));
  return new Date(batch.createdAt).getTime() - sessionStartMs - (lastT - event.t);
};

const hiddenIntervals = (events, endMs) => {
  const list = events.filter((e) => e.type === 'tab_hidden' || e.type === 'tab_visible').sort((a, b) => a.t - b.t);
  const out = [];
  let open = null;
  for (const e of list) {
    if (e.type === 'tab_hidden' && !open) open = e;
    else if (e.type === 'tab_visible' && open) { out.push({ from: open, durationMs: Math.max(0, e.t - open.t) }); open = null; }
  }
  if (open) out.push({ from: open, durationMs: Math.max(0, endMs - open.t), unfinished: true });
  return out;
};

const offlineIntervals = (events, endMs) => {
  const list = events.filter((e) => e.type === 'network_offline' || e.type === 'network_online').sort((a, b) => a.t - b.t);
  const out = [];
  let open = null;
  for (const e of list) {
    if (e.type === 'network_offline' && !open) open = e;
    else if (e.type === 'network_online' && open) { out.push({ from: open, durationMs: Math.max(0, e.t - open.t) }); open = null; }
  }
  if (open) out.push({ from: open, durationMs: Math.max(0, endMs - open.t), unfinished: true });
  return out;
};

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const deriveFlags = ({
  events = [], batches = [], similarity = [], thresholds = {}, sessionStartMs = 0, sessionEndMs = 0, includeTechnical = false,
} = {}) => {
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons = [];
  const behavioural = events.filter((e) => !e.technical && e.type !== 'network_offline' && e.type !== 'network_online');
  const endMs = Math.max(sessionEndMs, ...events.map((e) => e.t), 0);

  // 1. Left the page
  const hidden = hiddenIntervals(behavioural, endMs);
  const hiddenTotal = hidden.reduce((s, h) => s + h.durationMs, 0);
  if (hidden.length >= th.leftPageCount || hiddenTotal >= th.leftPageTotalSeconds * 1000) {
    reasons.push({
      code: 'left_page', kind: 'behaviour',
      text: `left the page ${times(hidden.length, 'time')} for a total of ${fmtDuration(hiddenTotal)}`,
      measured: { count: hidden.length, totalMs: hiddenTotal, longestMs: Math.max(...hidden.map((h) => h.durationMs)) },
      threshold: { leftPageCount: th.leftPageCount, leftPageTotalSeconds: th.leftPageTotalSeconds },
      evidence: hidden.slice(0, 25).map((h) => ev(h.from, { durationMs: h.durationMs, ...(h.unfinished ? { unfinished: true } : {}) })),
    });
  }

  // 2. Fullscreen exits
  const fs = behavioural.filter((e) => e.type === 'fullscreen_exit');
  if (fs.length >= th.fullscreenExits) {
    reasons.push({
      code: 'fullscreen_exit', kind: 'behaviour', text: `left full-screen mode ${times(fs.length, 'time')}`,
      measured: { count: fs.length }, threshold: { fullscreenExits: th.fullscreenExits }, evidence: fs.slice(0, 25).map((e) => ev(e)),
    });
  }

  // 3. Large pastes (browser paste events, merged with paste events seen by the editor)
  const pastes = behavioural.filter((e) => e.type === 'paste' && e.inEditor !== false && (e.len || 0) >= th.pasteChars)
    .map((e) => ({ at: e.t, len: e.len, questionId: e.questionId ? String(e.questionId) : null, evidence: [ev(e, { len: e.len })] }));
  for (const b of batches) {
    for (const e of b.events || []) {
      if (e.type !== 'paste' || (e.len || 0) < th.pasteChars) continue;
      const at = editEventAt(b, e, sessionStartMs);
      const batchRef = { kind: 'edit_batch', id: idOf(b), at, len: e.len };
      const twin = pastes.find((p) => Math.abs(p.at - at) <= 5000 && String(p.questionId) === String(b.questionId));
      if (twin) twin.evidence.push(batchRef);
      else pastes.push({ at, len: e.len, questionId: String(b.questionId), evidence: [batchRef] });
    }
  }
  pastes.sort((a, b) => b.len - a.len);
  for (const p of pastes.slice(0, 5)) {
    reasons.push({
      code: 'large_paste', kind: 'behaviour', text: `pasted ${num(p.len)} characters in one event at ${fmtClock(p.at)}`,
      measured: { chars: p.len, atMs: p.at, questionId: p.questionId }, threshold: { pasteChars: th.pasteChars }, evidence: p.evidence,
    });
  }

  // 4. Copy / cut volume
  const out = behavioural.filter((e) => e.type === 'copy' || e.type === 'cut');
  if (out.length >= th.clipboardOutCount) {
    reasons.push({
      code: 'clipboard_out', kind: 'behaviour', text: `copied or cut text ${times(out.length, 'time')}`,
      measured: { count: out.length }, threshold: { clipboardOutCount: th.clipboardOutCount }, evidence: out.slice(0, 25).map((e) => ev(e)),
    });
  }

  // 5. Typing speed (characters typed, pastes excluded, in one-minute windows of each batch's anchored time)
  const windows = new Map();
  for (const b of batches) {
    for (const e of b.events || []) {
      if (e.type !== 'insert') continue;
      const at = editEventAt(b, e, sessionStartMs);
      const key = Math.floor(at / 60000);
      const w = windows.get(key) || { chars: 0, batchIds: new Set() };
      w.chars += Math.max(1, Math.min(e.len || 1, 2000));
      w.batchIds.add(idOf(b));
      windows.set(key, w);
    }
  }
  const active = [...windows.entries()].filter(([, w]) => w.chars >= 30);
  const jumps = [];
  for (const [key, w] of active) {
    const others = active.filter(([k]) => k !== key).map(([, x]) => x.chars);
    const typical = median(others);
    const burst = w.chars >= th.typingBurstCpm;
    const jump = others.length >= 3 && w.chars >= th.typingJumpMinCpm && w.chars >= th.typingJumpRatio * typical;
    if (burst || jump) jumps.push({ key, w, typical, burst });
  }
  jumps.sort((a, b) => b.w.chars - a.w.chars);
  for (const j of jumps.slice(0, 3)) {
    const at = j.key * 60000;
    reasons.push({
      code: 'typing_speed', kind: 'behaviour',
      text: j.burst && !j.typical
        ? `typed about ${num(j.w.chars)} characters in one minute at ${fmtClock(at)}`
        : `typing speed jumped to about ${num(j.w.chars)} characters/minute at ${fmtClock(at)} (typical for this session: ${num(Math.round(j.typical))})`,
      measured: { charsPerMinute: j.w.chars, typicalCharsPerMinute: Math.round(j.typical), atMs: at },
      threshold: { typingBurstCpm: th.typingBurstCpm, typingJumpRatio: th.typingJumpRatio, typingJumpMinCpm: th.typingJumpMinCpm },
      evidence: [...j.w.batchIds].map((id) => ({ kind: 'edit_batch', id, at })),
    });
  }

  // 6. Hints from the browser (low confidence: they have innocent explanations)
  const dev = behavioural.filter((e) => e.type === 'devtools_hint');
  if (dev.length >= th.hintSignalCount) {
    reasons.push({
      code: 'devtools_hint', kind: 'hint', text: `the browser hinted that developer tools may have been open (${times(dev.length, 'signal')}; low confidence)`,
      measured: { count: dev.length }, threshold: { hintSignalCount: th.hintSignalCount }, evidence: dev.slice(0, 25).map((e) => ev(e)),
    });
  }
  const screens = behavioural.filter((e) => e.type === 'multiple_screens_hint');
  if (screens.length >= th.hintSignalCount) {
    reasons.push({
      code: 'multiple_screens_hint', kind: 'hint', text: `the browser reported more than one screen (${times(screens.length, 'signal')}; low confidence)`,
      measured: { count: screens.length }, threshold: { hintSignalCount: th.hintSignalCount }, evidence: screens.slice(0, 25).map((e) => ev(e)),
    });
  }

  // 7. Cohort similarity (computed by the similarity run; only flagged pairs are passed in)
  const flaggedPairs = similarity.filter((p) => p.flagged !== false);
  const others = new Set(flaggedPairs.map((p) => String(p.otherUserId)));
  if (others.size) {
    reasons.push({
      code: 'similar_submission', kind: 'similarity', text: `submission similar to ${others.size} other${others.size === 1 ? '' : 's'}`,
      measured: { others: others.size, pairs: flaggedPairs.map((p) => ({ questionId: String(p.questionId), containment: p.containment })) },
      threshold: { similarityContainment: flaggedPairs[0]?.threshold ?? th.similarityContainment },
      evidence: flaggedPairs.map((p) => ({ kind: 'similarity_pair', id: String(p.id), otherUserId: String(p.otherUserId), questionId: String(p.questionId), containment: p.containment })),
    });
  }

  // Technical: connectivity. Summarised for the reviewer, never counted as behaviour.
  const offline = offlineIntervals(events.filter((e) => e.type === 'network_offline' || e.type === 'network_online'), endMs);
  const technical = {
    offlineCount: offline.length,
    offlineMs: offline.reduce((s, o) => s + o.durationMs, 0),
    note: offline.length ? 'Connection drops can hide other events and explain gaps in the timeline. They are not treated as behaviour.' : '',
  };
  if (includeTechnical && offline.length) {
    reasons.push({
      code: 'connection_lost', kind: 'technical', text: `connection dropped ${times(offline.length, 'time')} (${fmtDuration(technical.offlineMs)} offline) [technical]`,
      measured: { count: offline.length, totalMs: technical.offlineMs }, threshold: {}, evidence: offline.slice(0, 25).map((o) => ev(o.from, { durationMs: o.durationMs })),
    });
  }

  return { reasons, technical };
};
