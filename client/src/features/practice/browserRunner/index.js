// Practice "Run" in the student's own browser, for Python (Pyodide) and JavaScript, so it spends no runner
// credits. It is never graded: Submit and anything scored always run on the server.
//
// It follows the server's contract: the test input is the program's stdin, stdout is compared with the expected
// output by the same rules (compare.js), with the question's time limit. Whatever cannot be reproduced exactly (an
// unsupported module, output formatting the shim cannot match, a browser without workers, Pyodide failing to load)
// makes runInBrowser return null, and the caller uses the server's Run instead.
import nodeFormatSource from './nodeFormat.js?raw';
import jsWorkerSource from './jsWorker.js?raw';
import pyWorkerSource from './pyWorker.js?raw';
import { outputsMatch } from './compare.js';

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

/**
 * Runs the program on each test in the student's browser (Python via Pyodide, JavaScript in a worker). Each test's
 * `input` is the program's stdin and its stdout is compared with `expectedOutput` by the server's rules.
 * tests: [{ id, input, expectedOutput, comparison? }]. Resolves with
 * { perTest: [{ testId, passed, stdout, stderr, timedOut }], ranIn: 'browser' }, or with null when the browser
 * cannot run this program exactly as the server would (the caller then uses the server Run).
 */
export const runInBrowser = async ({ language, source, tests, timeLimitMs }) => {
  try {
    const blocker = browserRunBlocker(language, source);
    if (blocker || !tests?.length) return null;
    const limitMs = Number(timeLimitMs) > 0 ? Number(timeLimitMs) : 2000;
    const perTest = [];
    for (const t of tests) {
      const input = String(t.input ?? '');
      const r = language === 'python'
        ? await runPython({ source, stdin: input, limitMs })
        : await runJavaScript({ source, stdin: input, limitMs });
      const ranOk = r.status === 'accepted';
      const timedOut = r.status === 'time_limit';
      perTest.push({
        testId: t.id,
        passed: ranOk && outputsMatch(r.stdout, t.expectedOutput, t.comparison || 'trim'),
        stdout: r.stdout,
        stderr: r.stderr || r.compileOutput || '',
        timedOut,
      });
    }
    return { perTest, ranIn: 'browser' };
  } catch (e) {
    if (e instanceof BrowserRunnerUnavailable) return null;
    throw e;
  }
};
