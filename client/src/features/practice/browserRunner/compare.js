// Exact copies of the server's output comparison and overall verdict (server/services/grading.js), so a Run in the
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

// JDoodle returns stdout and stderr as one text and no status, so the server infers the verdict from that text
// (server/services/execution/jdoodleProvider.js, classify). Copied here so a browser run reads the same way.
export const jdoodleClassify = (output) => {
  if (/JDoodle - Timeout|Time limit exceeded/i.test(output)) return 'time_limit';
  if (/Memory limit|out of memory|OutOfMemoryError|std::bad_alloc/i.test(output)) return 'memory_limit';
  if (/Traceback \(most recent call last\)|Exception in thread|Uncaught |ReferenceError|TypeError|panic:|Segmentation fault/.test(output)) return 'runtime_error';
  if (/SyntaxError|cannot find symbol|compilation (failed|terminated)|undefined reference|error:/i.test(output)) return 'compile_error';
  return 'accepted';
};

const FAILURE_ORDER = ['compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'wrong_answer'];

export const overallVerdict = (perTest) => {
  if (!perTest.length) return 'accepted';
  const failed = perTest.filter((t) => !t.passed);
  if (!failed.length) return 'accepted';
  for (const v of FAILURE_ORDER) if (failed.some((t) => t.verdict === v)) return v;
  return failed[0].verdict;
};
