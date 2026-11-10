/* global importScripts, loadPyodide */
// Web Worker that runs Python programs with Pyodide (CPython compiled to WebAssembly), the way `python3 main.py < input`
// does on the server. Loaded as raw text and started from a Blob URL (see index.js), so it must stay a plain script.
//
// In:  { type: 'init', indexURL } once, then { type: 'run', source, stdin, outputCap } one at a time.
// Out: { type: 'ready' } | { type: 'load_error', message } after init; per run { type: 'done', status, stdout,
//      stderr, merged, compileOutput, timeMs, exitCode } | { type: 'output_limit' } | { type: 'fatal', message }.
// status is accepted | exited (sys.exit with a non-zero code) | runtime_error | compile_error | memory_limit.
// Time limits are enforced by the page, which terminates this worker.
(function pyWorker() {
  'use strict';
  var py = null;

  // sys.stdin/stdout/stderr are replaced for each run, like a fresh process: stdin is the test input as UTF-8 with
  // newline='\n' (CPython on Linux does not translate \r\n on stdin), stdout/stderr collect bytes.
  var HARNESS = [
    'import sys, io, json, time, traceback, builtins',
    '_DEFAULT_RECURSION = sys.getrecursionlimit()',
    'class _PrepwiseLimit(BaseException):',
    '    pass',
    'class _Sink(io.RawIOBase):',
    '    def __init__(self, shared):',
    '        self.data = bytearray()',
    '        self.shared = shared',
    '    def writable(self):',
    '        return True',
    '    def write(self, b):',
    '        b = bytes(b)',
    '        self.data += b',
    '        self.shared["merged"] += b',
    '        self.shared["size"] += len(b)',
    '        if self.shared["size"] > self.shared["cap"]:',
    '            self.shared["on_limit"]()',
    '            raise _PrepwiseLimit()',
    '        return len(b)',
    'def _prepwise_run(src, stdin_text, cap, on_limit):',
    '    shared = {"size": 0, "cap": cap, "on_limit": on_limit, "merged": bytearray()}',
    '    out, err = _Sink(shared), _Sink(shared)',
    '    saved = (sys.stdin, sys.stdout, sys.stderr)',
    '    sys.stdin = io.TextIOWrapper(io.BytesIO(stdin_text.encode("utf-8")), encoding="utf-8", newline="\\n")',
    '    sys.stdout = io.TextIOWrapper(io.BufferedWriter(out), encoding="utf-8", newline="\\n", write_through=True)',
    '    sys.stderr = io.TextIOWrapper(io.BufferedWriter(err), encoding="utf-8", errors="backslashreplace", newline="\\n", write_through=True)',
    '    status, compile_output, exit_code = "accepted", "", 0',
    '    started = time.perf_counter()',
    '    try:',
    '        try:',
    '            code = compile(src, "main.py", "exec")',
    '        except (SyntaxError, ValueError) as e:',
    '            status = "compile_error"',
    '            compile_output = "".join(traceback.format_exception_only(type(e), e))',
    '        else:',
    '            g = {"__name__": "__main__", "__builtins__": builtins, "__doc__": None, "__package__": None, "__spec__": None}',
    '            try:',
    '                exec(code, g)',
    '            except SystemExit as e:',
    '                c = e.code',
    '                if c is None:',
    '                    pass',
    '                elif isinstance(c, int):',
    '                    exit_code = int(c)',
    '                else:',
    '                    print(c, file=sys.stderr)',
    '                    exit_code = 1',
    '                if exit_code:',
    '                    status = "exited"',
    '            except _PrepwiseLimit:',
    '                status = "output_limit"',
    '            except MemoryError as e:',
    '                status = "memory_limit"',
    '                traceback.print_exception(type(e), e, e.__traceback__.tb_next)',
    '            except BaseException as e:',
    '                status = "runtime_error"',
    '                traceback.print_exception(type(e), e, e.__traceback__.tb_next)',
    '        try:',
    '            sys.stdout.flush()',
    '            sys.stderr.flush()',
    '        except _PrepwiseLimit:',
    '            status = "output_limit"',
    '    finally:',
    '        elapsed = round((time.perf_counter() - started) * 1000)',
    '        sys.stdin, sys.stdout, sys.stderr = saved',
    '        sys.setrecursionlimit(_DEFAULT_RECURSION)',
    '    dec = lambda b: bytes(b).decode("utf-8", "replace")',
    '    return json.dumps({"status": status, "stdout": dec(out.data), "stderr": dec(err.data), "merged": dec(shared["merged"]),',
    '                       "compileOutput": compile_output, "timeMs": elapsed, "exitCode": exit_code})',
  ].join('\n');

  function message(err) { return String((err && err.message) || err); }

  async function init(indexURL) {
    try {
      importScripts(indexURL + 'pyodide.js');
      py = await loadPyodide({ indexURL: indexURL, stdout: function () {}, stderr: function () {} });
      py.runPython(HARNESS);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'load_error', message: message(err) });
    }
  }

  function run(m) {
    var fn = null;
    try {
      fn = py.globals.get('_prepwise_run');
      var json = fn(String(m.source || ''), String(m.stdin || ''), m.outputCap || 65536, function () { self.postMessage({ type: 'output_limit' }); });
      var r = JSON.parse(json);
      r.type = 'done';
      self.postMessage(r);
    } catch (err) {
      // Pyodide itself failed (for example the JavaScript stack overflowed); the page discards this worker
      self.postMessage({ type: 'fatal', message: message(err) });
    } finally {
      if (fn && fn.destroy) fn.destroy();
    }
  }

  self.onmessage = function onmessage(e) {
    var m = e.data || {};
    if (m.type === 'init') init(m.indexURL);
    else if (m.type === 'run') run(m);
  };
}());
