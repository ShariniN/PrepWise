// TEST-ONLY in-process JavaScript runner. It exists so the test suite can prove that seed tests agree with
// seed reference solutions and can stand in for the sandbox. node:vm is NOT a security boundary: this file
// must never be imported by application code.
import vm from 'node:vm';

export const runJs = (source, stdin = '', { timeoutMs = 1500 } = {}) => {
  const out = [];
  const err = [];
  const started = Date.now();
  const fmt = (args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const fsShim = { readFileSync: () => stdin };
  const sandbox = {
    console: { log: (...a) => out.push(fmt(a)), error: (...a) => err.push(fmt(a)), info: (...a) => out.push(fmt(a)) },
    require: (name) => {
      if (name === 'fs') return fsShim;
      throw new Error(`require('${name}') is not available in the test checker`);
    },
    process: { stdout: { write: (s) => out.push(String(s).replace(/\n$/, '')) }, argv: [], stdin: {} },
  };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  let script;
  try {
    script = new vm.Script(source, { filename: 'solution.js' });
  } catch (e) {
    return { status: 'compile_error', stdout: '', stderr: '', compileOutput: String(e.message), timeMs: 0, memoryKb: null };
  }
  try {
    script.runInContext(ctx, { timeout: timeoutMs });
  } catch (e) {
    const timedOut = e?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
    return {
      status: timedOut ? 'time_limit' : 'runtime_error',
      stdout: out.join('\n') + (out.length ? '\n' : ''),
      stderr: String(e?.message || e),
      compileOutput: '',
      timeMs: Date.now() - started,
      memoryKb: null,
    };
  }
  return {
    status: 'accepted',
    stdout: out.join('\n') + (out.length ? '\n' : ''),
    stderr: err.join('\n'),
    compileOutput: '',
    timeMs: Date.now() - started,
    memoryKb: null,
  };
};

// A provider with the same shape as the real ones, backed by runJs. Only javascript is supported.
export class VmProvider {
  constructor() { this.name = 'vm-test'; this.calls = 0; this.down = false; }
  configured() { return true; }
  async run({ language, source, stdin }) {
    this.calls += 1;
    if (this.down) {
      const { ExecutionUnavailableError } = await import('../../services/execution/errors.js');
      throw new ExecutionUnavailableError('down for test', 'network');
    }
    if (language !== 'javascript') throw new Error(`VmProvider only runs javascript, got ${language}`);
    return runJs(source, stdin);
  }
}
