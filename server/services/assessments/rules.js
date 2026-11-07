// Pure assessment rules: deadlines, effective status, deterministic shuffle and variant choice.
import crypto from 'node:crypto';

// Requests that arrive up to this long after the deadline are still accepted (network latency, a last autosave).
export const GRACE_MS = 10 * 1000;
// Integrity events are accepted a little longer so the final page-hide / offline signals are not lost.
export const EVENT_GRACE_MS = 5 * 60 * 1000;

export const hashInt = (...parts) => crypto.createHash('sha256').update(parts.map(String).join('|')).digest().readUInt32BE(0);

// Small deterministic PRNG (mulberry32).
const prng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const seededShuffle = (items, seed) => {
  const out = [...items];
  const rand = prng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Members of a variant group (including the listed question) sorted by id so the choice does not depend on query order.
export const pickVariant = (members, userId, assessmentId, group) => {
  const sorted = [...members].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return sorted[hashInt(userId, assessmentId, 'variant', group) % sorted.length];
};

// slots: [{ baseQuestionId, resolvedQuestionId }] -> frozen per-student list in this student's order.
export const orderSlots = (slots, userId, assessmentId, shuffle) => {
  const numbered = slots.map((s, slot) => ({ slot, ...s }));
  return shuffle ? seededShuffle(numbered, hashInt(userId, assessmentId, 'order')) : numbered;
};

export const accommodationFor = (assessment, userId) =>
  (assessment.accommodations || []).find((a) => String(a.userId) === String(userId)) || { extraTimePercent: 0, disabledSignals: [] };

// deadline = min(start + duration * (1 + extra%), closesAt). Lecturer extensions are added afterwards.
export const computeBaseDeadline = ({ startedAt, durationMinutes, extraTimePercent = 0, closesAt }) => {
  const byDuration = new Date(startedAt).getTime() + durationMinutes * 60 * 1000 * (1 + extraTimePercent / 100);
  return new Date(Math.min(byDuration, new Date(closesAt).getTime()));
};

export const sessionDeadline = (session) => new Date(new Date(session.baseDeadline).getTime() + (session.extensionMs || 0));

// Stored status draft/closed are final; scheduled/open follow the clock.
export const effectiveStatus = (assessment, now = new Date()) => {
  if (assessment.status === 'draft' || assessment.status === 'closed') return assessment.status;
  const t = new Date(now).getTime();
  if (t < new Date(assessment.opensAt).getTime()) return 'scheduled';
  if (t > new Date(assessment.closesAt).getTime()) return 'closed';
  return 'open';
};

// Is the student still allowed to write to this session? Returns null or { code, message }.
export const sessionWriteBlock = (session, now = new Date(), { graceMs = GRACE_MS } = {}) => {
  if (session.status !== 'active') return { code: 'SESSION_ENDED', message: 'This assessment session has already been submitted.' };
  if (new Date(now).getTime() > sessionDeadline(session).getTime() + graceMs) {
    return { code: 'TIME_UP', message: 'Time is up for this assessment. Nothing more can be saved or submitted.' };
  }
  return null;
};

export const remainingSeconds = (session, now = new Date()) =>
  Math.max(0, Math.ceil((sessionDeadline(session).getTime() - new Date(now).getTime()) / 1000));
