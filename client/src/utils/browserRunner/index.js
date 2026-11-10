// Practice "Run" in the student's own browser, for Python (Pyodide) and JavaScript, so it spends no runner
// credits. It is never graded: Submit and anything scored always run on the server.
//
// It follows the server's contract exactly: the test input is the program's stdin, stdout is compared with the
// expected output by the same rules (compare.js), with the question's time limit. When the server's runner is
// JDoodle, which merges stderr into the output and infers the verdict from that text, the result is read the same
// way. Whatever cannot be reproduced exactly (an unsupported module, output formatting the shim cannot match, a
// browser without workers, Pyodide failing to load) throws BrowserRunnerUnavailable, and the caller uses the
// server's Run instead.
import nodeFormatSource from './nodeFormat.js?raw';
import jsWorkerSource from './jsWorker.js?raw';
import pyWorkerSource from './pyWorker.js?raw';
import { outputsMatch, overallVerdict, jdoodleClassify } from './compare.js';

export const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
export const OUTPUT_CAP = 64 * 1024; // stdout + stderr, per program
export const BROWSER_LANGUAGES = ['javascript', 'python'];
const PYODIDE_LOAD_TIMEOUT_MS = 60 * 1000;
const WORKER_START_TIMEOUT_MS = 10 * 1000;
const GRACE_MS = 100; // message passing; the time a program used is also checked against the limit

export class BrowserRunnerUnavailable extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'BrowserRunnerUnavailable';
  }
}

// ---- what can run here ----
const JS_MODULES = new Set(['fs', 'node:fs', 'readline', 'node:readline']);
// Pure standard-library modules that behave in Pyodide as in CPython on the server.
const PY_MODULES = new Set([
  '__future__', 'abc', 'array', 'bisect', 'calendar', 'cmath', 'collections', 'contextlib', 'copy', 'dataclasses', 'datetime',
  'decimal', 'enum', 'fractions', 'functools', 'heapq', 'io', 'itertools', 'json', 'keyword', 'math', 'numbers', 'operator',
  'pprint', 'random', 're', 'statistics', 'string', 'struct', 'sys', 'textwrap', 'time', 'types', 'typing', 'unicodedata',
]);

const jsBlocker = (src) => {
  const uses = (src.match(/\brequire\b(?!\.main\b)/g) || []).length;
  const calls = [...src.matchAll(/\brequire\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g)];
  if (calls.length !== uses) return 'require() used in a way the browser runner cannot follow';
  const other = calls.map((m) => m[2]).find((n) => !JS_MODULES.has(n));
  if (other) return `require('${other}')`;
  if (/\bimport\s*\(/.test(src)) return 'import()';
  const api = src.match(/\b(Buffer|fetch|XMLHttpRequest|WebSocket|importScripts|postMessage|indexedDB|WebAssembly|Worker|SharedArrayBuffer|Atomics)\b/);
  if (api) return api[1];
  return null;
};

const pyBlocker = (src) => {
  for (const m of src.matchAll(/^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import\b|import[ \t]+([^\n#;]+))/gm)) {
    const names = m[1] ? [m[1]] : m[2].split(',').map((s) => s.trim().split(/\s+/)[0]);
    const other = names.find((n) => !PY_MODULES.has(n.split('.')[0]));
    if (other !== undefined) return `import ${other}`;
  }
  // stdin through file descriptors, dynamic imports, deep recursion settings: Pyodide differs from CPython there
  const api = src.match(/\b(__import__|importlib|setrecursionlimit|fileno)\b/) || src.match(/\b(open)\s*\(/) || src.match(/\b(os)\./);
  if (api) return api[1];
  return null;
};

let pythonBroken = false; // Pyodide failed to load once in this page: use the server for the rest of the session

/** Why this program cannot run in the browser (a short reason), or null when it can. */
export const browserRunBlocker = (language, source) => {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') return 'no web workers';
  if (language === 'javascript') return jsBlocker(String(source || ''));
  if (language === 'python') return pythonBroken ? 'Python could not be loaded in this browser' : pyBlocker(String(source || ''));
  return 'language not supported in the browser';
};

// ---- workers ----
const blobUrls = {};
const workerUrl = (key, parts) => {
  if (!blobUrls[key]) blobUrls[key] = URL.createObjectURL(new Blob(parts, { type: 'text/javascript' }));
  return blobUrls[key];
};

// Resolves with the next message, { type: 'timeout' } or { type: 'worker_error' }.
const nextMessage = (worker, timeoutMs) => new Promise((resolve) => {
  let timer = null;
  function cleanup() {
    clearTimeout(timer);
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onError);
  }
  function onMessage(e) { cleanup(); resolve(e.data || {}); }
  function onError(e) { e.preventDefault?.(); cleanup(); resolve({ type: 'worker_error', message: e.message || 'worker error' }); }
  timer = setTimeout(() => { cleanup(); resolve({ type: 'timeout' }); }, timeoutMs);
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);
});

const outcome = (m, limitMs) => {
  if (m.type === 'timeout') return { status: 'time_limit', stdout: '', stderr: '', merged: '', compileOutput: '', timeMs: limitMs };
  if (m.type === 'output_limit') {
    const note = `Output limit exceeded: more than ${OUTPUT_CAP / 1024} KB was printed.`;
    return { status: 'output_limit', stdout: '', stderr: note, merged: note, compileOutput: '', timeMs: null };
  }
  if (m.type === 'fatal') return { status: 'runtime_error', stdout: '', stderr: m.message, merged: m.message, compileOutput: '', timeMs: null };
  if (m.type !== 'done') throw new BrowserRunnerUnavailable(m.message || 'the browser runner stopped');
  if (m.unmatchable) throw new BrowserRunnerUnavailable(`output the browser cannot reproduce exactly (${m.unmatchable})`);
  const slow = m.timeMs > limitMs && (m.status === 'accepted' || m.status === 'exited');
  return { ...m, status: slow ? 'time_limit' : m.status };
};

const runJavaScript = async ({ source, stdin, limitMs }) => {
  let worker;
  try {
    worker = new Worker(workerUrl('js', [nodeFormatSource, '\n;\n', jsWorkerSource]));
  } catch (e) {
    throw new BrowserRunnerUnavailable(`could not start a worker: ${e.message}`);
  }
  try {
    const ready = await nextMessage(worker, WORKER_START_TIMEOUT_MS);
    if (ready.type !== 'ready') throw new BrowserRunnerUnavailable('the JavaScript runner did not start');
    worker.postMessage({ source, stdin, outputCap: OUTPUT_CAP });
    return outcome(await nextMessage(worker, limitMs + GRACE_MS), limitMs);
  } finally {
    worker.terminate();
  }
};

let python = null; // { worker, ready: Promise<boolean> }
const pythonWorker = async (onStatus) => {
  if (pythonBroken) throw new BrowserRunnerUnavailable('Python could not be loaded in this browser');
  if (!python) {
    onStatus?.('loading');
    let worker;
    try {
      worker = new Worker(workerUrl('py', [pyWorkerSource]));
    } catch (e) {
      throw new BrowserRunnerUnavailable(`could not start a worker: ${e.message}`);
    }
    const ready = (async () => {
      worker.postMessage({ type: 'init', indexURL: PYODIDE_INDEX_URL });
      return (await nextMessage(worker, PYODIDE_LOAD_TIMEOUT_MS)).type === 'ready';
    })();
    python = { worker, ready };
  }
  const current = python;
  if (!(await current.ready)) {
    current.worker.terminate();
    if (python === current) python = null;
    pythonBroken = true;
    throw new BrowserRunnerUnavailable('Python could not be loaded in this browser');
  }
  return current.worker;
};

const runPython = async ({ source, stdin, limitMs, onStatus }) => {
  const worker = await pythonWorker(onStatus);
  onStatus?.('running');
  worker.postMessage({ type: 'run', source, stdin, outputCap: OUTPUT_CAP });
  const m = await nextMessage(worker, limitMs + GRACE_MS);
  if (m.type !== 'done') { // stopped (time limit, output limit) or broken: the next run gets a fresh interpreter
    worker.terminate();
    if (python?.worker === worker) python = null;
  }
  return outcome(m, limitMs);
};

/** Starts loading Pyodide in the background (for example when a Python question opens). Errors are ignored. */
export const warmUpPython = () => { pythonWorker().catch(() => {}); };

// ---- reading a run the way the server does ----
// `provider` is the server's runner name (GET /api/code/health). JDoodle sends back stdout and stderr as one text
// and the server infers the verdict from it; every other provider keeps them apart and reports the real status.
const asServerWouldSee = (r, provider) => {
  if (provider === 'jdoodle' && ['accepted', 'exited', 'runtime_error'].includes(r.status)) {
    const inferred = jdoodleClassify(r.merged);
    const status = inferred === 'accepted' && r.status === 'runtime_error' ? 'runtime_error' : inferred;
    return {
      status,
      stdout: status === 'accepted' ? r.merged : '',
      stderr: status === 'accepted' || status === 'compile_error' ? '' : r.merged,
      compileOutput: status === 'compile_error' ? r.merged : '',
      timeMs: r.timeMs,
    };
  }
  return {
    status: r.status === 'exited' ? 'runtime_error' : r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    compileOutput: r.compileOutput,
    timeMs: r.timeMs,
  };
};

/**
 * Runs the program in the browser. With a non-empty `stdin` it is one run on that input (like the server's custom
 * Run); otherwise every visible test runs. Returns the same shape as POST /api/practice/questions/:id/run plus
 * `ranIn: 'browser'`. Throws BrowserRunnerUnavailable when the server must be used instead.
 * `onStatus('loading' | 'running')` reports progress (loading only happens on the first Python run).
 */
export const runInBrowser = async ({ language, source, stdin, tests, timeLimitMs, provider, onStatus }) => {
  const blocker = browserRunBlocker(language, source);
  if (blocker) throw new BrowserRunnerUnavailable(blocker);
  const limitMs = Number(timeLimitMs) > 0 ? Number(timeLimitMs) : 2000;
  const once = async (input) => asServerWouldSee(language === 'python'
    ? await runPython({ source, stdin: input, limitMs, onStatus })
    : await runJavaScript({ source, stdin: input, limitMs }), provider);

  if (typeof stdin === 'string' && stdin !== '') {
    const r = await once(stdin);
    return {
      success: true, mode: 'custom', ranIn: 'browser', verdict: r.status, stdout: r.stdout, stderr: r.stderr,
      compileOutput: r.compileOutput, timeMs: r.timeMs, memoryKb: null,
    };
  }
  if (!tests?.length) throw new BrowserRunnerUnavailable('no visible tests');
  const results = [];
  for (const [i, t] of tests.entries()) {
    const r = await once(String(t.input ?? ''));
    const ranOk = r.status === 'accepted';
    const passed = ranOk && outputsMatch(r.stdout, t.expectedOutput, t.comparison || 'trim');
    results.push({
      index: i + 1, testId: t.id, visible: true, passed, verdict: passed ? 'accepted' : (ranOk ? 'wrong_answer' : r.status),
      timeMs: r.timeMs, memoryKb: null, input: t.input, expectedOutput: t.expectedOutput, actualOutput: r.stdout,
      error: r.compileOutput || r.stderr || '',
    });
  }
  return { success: true, mode: 'visible_tests', ranIn: 'browser', verdict: overallVerdict(results), tests: results };
};
