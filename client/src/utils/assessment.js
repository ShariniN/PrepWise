// Small helpers shared by the assessment and integrity screens.

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

// 3725 -> "1:02:05", 65 -> "1:05"
export const fmtClock = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
};

// ms since session start -> "00:14:03"
export const fmtOffset = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const two = (n) => String(n).padStart(2, '0');
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
};

export const fmtDuration = (minutes) => {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

// Every signal the browser can report, with a plain description for students and staff.
export const SIGNAL_LABELS = {
  tab_hidden: 'Tab hidden',
  tab_visible: 'Tab visible again',
  window_blur: 'Window lost focus',
  window_focus: 'Window focused',
  fullscreen_exit: 'Left full screen',
  paste: 'Paste',
  copy: 'Copy',
  cut: 'Cut',
  contextmenu: 'Right-click menu',
  devtools_hint: 'Developer tools hint',
  multiple_screens_hint: 'Multiple screens hint',
  network_offline: 'Connection lost',
  network_online: 'Connection back',
};
export const ALL_SIGNALS = Object.keys(SIGNAL_LABELS);

// Local acknowledgement of the "what is recorded" notice, per assessment.
const ackKey = (id) => `prepwise.integrityAck.${id}`;
export const readAck = (id) => {
  try { return localStorage.getItem(ackKey(id)); } catch { return null; }
};
export const writeAck = (id) => {
  const at = new Date().toISOString();
  try { localStorage.setItem(ackKey(id), at); } catch { /* optional */ }
  return at;
};

// Which questions the student has submitted at least once, kept per session in this browser.
const subKey = (sid) => `prepwise.submitted.${sid}`;
export const readSubmitted = (sid) => {
  try { return JSON.parse(localStorage.getItem(subKey(sid)) || '[]'); } catch { return []; }
};
export const markSubmitted = (sid, qid) => {
  const cur = readSubmitted(sid);
  if (cur.includes(qid)) return cur;
  const next = [...cur, qid];
  try { localStorage.setItem(subKey(sid), JSON.stringify(next)); } catch { /* optional */ }
  return next;
};

export const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-800',
  open: 'bg-green-100 text-green-800',
  closed: 'bg-gray-200 text-gray-700',
};
