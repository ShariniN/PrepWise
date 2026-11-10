// Exact copy of the server's output comparison (server/services/grading.js), so a Run in the
// browser passes or fails a visible test exactly when the server would. Keep the two in step; the browser-runner
// check (tools/e2e/browser-runner-format.mjs) compares them on a set of inputs.
const normalizeNewlines = (s) => String(s ?? '').replace(/\r\n?/g, '\n');

export const outputsMatch = (actual, expected, mode = 'trim') => {
  const a = normalizeNewlines(actual);
  const e = normalizeNewlines(expected);
  if (mode === 'exact') return a === e;
  if (mode === 'tokens') {
    const ta = a.split(/\s+/).filter(Boolean);
    const te = e.split(/\s+/).filter(Boolean);
    return ta.length === te.length && ta.every((t, i) => t === te[i]);
  }
  const lines = (s) => s.replace(/\s+$/, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  const la = lines(a);
  const le = lines(e);
  return la.length === le.length && la.every((l, i) => l === le[i]);
};
