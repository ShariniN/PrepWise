/* global PrepwiseNodeFormat */
// Web Worker that runs ONE JavaScript program the way `node main.js < input` does on the server: a CommonJS
// module body with require('fs').readFileSync(0 | '/dev/stdin'), require('readline'), process.stdin events,
// process.stdout.write and console.* (formatted like Node, see nodeFormat.js). Loaded as raw text and started from a
// Blob URL (see index.js), after nodeFormat.js, so it must stay a plain script: no imports or exports.
//
// Messages out: { type: 'ready' } once, then one { type: 'done', status, stdout, stderr, merged, compileOutput,
// timeMs, exitCode, unmatchable } or { type: 'output_limit' }. status is accepted | exited (non-zero exit code, no
// exception) | runtime_error | compile_error. Time limits are enforced by the page, which terminates this worker.
(function jsWorker() {
  'use strict';
  var F = PrepwiseNodeFormat;
  var nativeSetTimeout = self.setTimeout.bind(self);
  var nativeClearTimeout = self.clearTimeout.bind(self);
  var nativeSetInterval = self.setInterval.bind(self);
  var nativeClearInterval = self.clearInterval.bind(self);

  function ExitSignal(code) { this.code = code; }
  function LimitSignal() {}

  self.onmessage = function onmessage(e) {
    self.onmessage = null; // one program per worker
    run(e.data);
  };
  self.postMessage({ type: 'ready' });

  function run(msg) {
    var source = String(msg.source || '');
    var stdin = String(msg.stdin || '');
    var cap = msg.outputCap || 65536;
    var out = '';
    var err = '';
    var merged = '';
    var size = 0;
    var done = false;
    var unmatchable = null;
    var compileOutput = '';
    var exitCode = 0;
    var exitListeners = [];
    var started = performance.now();

    function flag(reason) { if (!unmatchable) unmatchable = reason; }

    function write(toStdout, s) {
      if (done) return;
      size += s.length;
      if (size > cap) {
        done = true;
        self.postMessage({ type: 'output_limit' });
        throw new LimitSignal();
      }
      if (toStdout) out += s; else err += s;
      merged += s;
    }

    function fmt(args) {
      try {
        return F.format(Array.prototype.slice.call(args));
      } catch (e) {
        if (e instanceof F.Unmatchable) { flag(e.reason); return ''; }
        throw e;
      }
    }

    function finish(status) {
      if (done) return;
      if (!exitCode && processObj.exitCode) exitCode = Number(processObj.exitCode) || 0;
      for (var i = 0; i < exitListeners.length; i++) {
        try { exitListeners[i](exitCode); } catch (e) { if (!(e instanceof ExitSignal)) { status = 'runtime_error'; err += errorText(e); } }
      }
      if (done) return;
      done = true;
      if (status === 'accepted' && exitCode) status = 'exited';
      self.postMessage({
        type: 'done', status: status, stdout: out, stderr: err, merged: merged, compileOutput: compileOutput,
        timeMs: Math.round(performance.now() - started), exitCode: exitCode, unmatchable: unmatchable,
      });
    }

    function errorText(e) {
      if (e && typeof e === 'object' && typeof e.stack === 'string') return e.stack + '\n';
      try { return 'Uncaught ' + F.format([e]) + '\n'; } catch { return 'Uncaught ' + String(e) + '\n'; }
    }

    // An exception that escaped the program, a callback or a rejected promise: Node prints it and exits with 1.
    function crash(e) {
      if (done) return;
      if (e instanceof LimitSignal) return;
      if (e instanceof ExitSignal) { exitCode = e.code; finish('accepted'); return; }
      var text = errorText(e);
      err += text;
      merged += text;
      finish('runtime_error');
    }

    function guarded(fn, self_, args) {
      if (done) return;
      try { fn.apply(self_, args || []); } catch (e) { crash(e); }
    }

    // ---- event loop bookkeeping: the program ends when nothing is pending, as in Node ----
    var pending = 0;
    function settle() {
      if (done || pending > 0) return;
      // Two hops, so promise jobs and any unhandledrejection event run before the program is declared finished.
      nativeSetTimeout(function () {
        nativeSetTimeout(function () { if (!done && pending === 0) finish('accepted'); }, 0);
      }, 0);
    }
    function later(fn) { // a tracked macrotask
      pending++;
      nativeSetTimeout(function () { pending--; guarded(fn); settle(); }, 0);
    }

    function makeTimer(repeat) {
      return function (fn, delay) {
        if (typeof fn !== 'function') throw new TypeError('The "callback" argument must be of type function. Received ' + typeof fn);
        var args = Array.prototype.slice.call(arguments, 2);
        var handle = { active: true, counted: true };
        var tick = function () {
          if (!repeat) { handle.active = false; if (handle.counted) { pending--; handle.counted = false; } }
          guarded(fn, handle, args);
          settle();
        };
        pending++;
        handle.id = repeat ? nativeSetInterval(tick, delay) : nativeSetTimeout(tick, delay);
        handle.ref = function () { if (!handle.counted && handle.active) { pending++; handle.counted = true; } return handle; };
        handle.unref = function () { if (handle.counted) { pending--; handle.counted = false; settle(); } return handle; };
        handle.hasRef = function () { return handle.counted; };
        handle.refresh = function () { return handle; };
        handle[Symbol.toPrimitive] = function () { return handle.id; };
        return handle;
      };
    }
    function clearTimer(h) {
      if (!h || typeof h !== 'object' || !h.active) return;
      h.active = false;
      nativeClearTimeout(h.id);
      nativeClearInterval(h.id);
      if (h.counted) { pending--; h.counted = false; }
      settle();
    }
    var timers = {
      setTimeout: makeTimer(false),
      setInterval: makeTimer(true),
      setImmediate: function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return makeTimer(false).apply(null, [fn, 0].concat(args));
      },
      clearTimeout: clearTimer,
      clearInterval: clearTimer,
      clearImmediate: clearTimer,
    };

    self.addEventListener('unhandledrejection', function (ev) { ev.preventDefault(); crash(ev.reason); });
    self.addEventListener('error', function (ev) { ev.preventDefault(); crash(ev.error); });

    // ---- tiny event emitter ----
    function emitter(target) {
      var map = {};
      target.on = function (ev, fn) { (map[ev] = map[ev] || []).push(fn); if (target._onListen) target._onListen(ev); return target; };
      target.addListener = target.on;
      target.once = function (ev, fn) {
        var w = function () { target.off(ev, w); fn.apply(target, arguments); };
        w.listener = fn;
        return target.on(ev, w);
      };
      target.off = function (ev, fn) {
        map[ev] = (map[ev] || []).filter(function (x) { return x !== fn && x.listener !== fn; });
        return target;
      };
      target.removeListener = target.off;
      target.removeAllListeners = function (ev) { if (ev) delete map[ev]; else map = {}; return target; };
      target.listenerCount = function (ev) { return (map[ev] || []).length; };
      target.emit = function (ev) {
        var args = Array.prototype.slice.call(arguments, 1);
        var list = (map[ev] || []).slice();
        for (var i = 0; i < list.length; i++) list[i].apply(target, args);
        return list.length > 0;
      };
      return target;
    }

    // What readFileSync(0) returns without an encoding: Buffer-like bytes whose toString() is the text.
    function stdinBuffer() {
      var bytes = new TextEncoder().encode(stdin);
      bytes.toString = function (enc) {
        if (enc !== undefined && !/^utf-?8$/i.test(String(enc))) flag('stdin decoded as ' + enc);
        return stdin;
      };
      return bytes;
    }

    // ---- process.stdin: one chunk (inputs are at most 16 KB, below Node's 64 KB read size), then 'end' ----
    var stdinState = { encoding: null, flowing: false, scheduled: false, delivered: false, read: false, readline: null };
    var processStdin = emitter({ fd: 0, isTTY: undefined, readable: true });
    processStdin._onListen = function (ev) {
      if (ev === 'data') stdinState.flowing = true;
      if (ev === 'data' || ev === 'readable') scheduleStdin();
    };
    processStdin.setEncoding = function (enc) { stdinState.encoding = enc || 'utf8'; return processStdin; };
    processStdin.resume = function () { stdinState.flowing = true; scheduleStdin(); return processStdin; };
    processStdin.pause = function () { return processStdin; };
    processStdin.unref = function () { return processStdin; };
    processStdin.ref = function () { return processStdin; };
    processStdin.read = function () {
      if (stdinState.read || !stdinState.delivered) return null;
      stdinState.read = true;
      if (!stdin.length) return null;
      return stdinState.encoding ? stdin : stdinBuffer();
    };
    function scheduleStdin() {
      if (stdinState.scheduled) return;
      stdinState.scheduled = true;
      later(function () {
        stdinState.delivered = true;
        if (stdinState.readline) { stdinState.readline(); return; }
        if (processStdin.listenerCount('readable')) {
          processStdin.emit('readable');
          stdinState.read = true;
          later(function () {
            processStdin.emit('readable');
            later(function () { processStdin.emit('end'); later(function () { processStdin.emit('close'); }); });
          });
          return;
        }
        if (!stdinState.flowing) return;
        if (stdin.length) processStdin.emit('data', stdinState.encoding ? stdin : stdinBuffer());
        later(function () { processStdin.emit('end'); later(function () { processStdin.emit('close'); }); });
      });
    }

    var processStdout = { fd: 1, isTTY: undefined, writable: true };
    var processStderr = { fd: 2, isTTY: undefined, writable: true };
    function streamWrite(toStdout) {
      return function (chunk, enc, cb) {
        if (typeof chunk !== 'string') {
          if (chunk instanceof Uint8Array) { flag('writing bytes to stdout'); chunk = new TextDecoder().decode(chunk); } else {
            throw new TypeError('The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received ' + (chunk === null ? 'null' : typeof chunk));
          }
        }
        write(toStdout, chunk);
        var callback = typeof enc === 'function' ? enc : cb;
        if (typeof callback === 'function') later(function () { callback(); });
        return true;
      };
    }
    processStdout.write = streamWrite(true);
    processStderr.write = streamWrite(false);
    emitter(processStdout);
    emitter(processStderr);

    var processObj = {
      stdin: processStdin, stdout: processStdout, stderr: processStderr,
      argv: ['/usr/local/bin/node', '/home/main.js'], argv0: 'node', execArgv: [], env: {}, platform: 'linux', pid: 1, ppid: 0,
      exitCode: undefined,
      exit: function (code) {
        var c = code === undefined ? (processObj.exitCode || 0) : (Number(code) || 0);
        throw new ExitSignal(c);
      },
      nextTick: function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        queueMicrotask(function () { guarded(fn, null, args); });
      },
      hrtime: Object.assign(function (prev) {
        var t = performance.now() * 1e6;
        var s = Math.floor(t / 1e9);
        var ns = Math.floor(t % 1e9);
        if (prev) { s -= prev[0]; ns -= prev[1]; if (ns < 0) { s -= 1; ns += 1e9; } }
        return [s, ns];
      }, { bigint: function () { return BigInt(Math.floor(performance.now() * 1e6)); } }),
      on: function (ev, fn) {
        if (ev === 'exit') exitListeners.push(fn); else flag('process.on("' + ev + '")');
        return processObj;
      },
    };
    processObj.once = processObj.on;
    processObj.addListener = processObj.on;
    var processProxy = new Proxy(processObj, {
      get: function (target, key) {
        if (key in target || typeof key === 'symbol') return target[key];
        flag('process.' + String(key));
        return undefined;
      },
    });

    // ---- require('fs') and require('readline') ----
    function isStdinPath(p) { return p === 0 || p === '/dev/stdin'; }
    var fsModule = new Proxy({
      readFileSync: function (p, opts) {
        if (!isStdinPath(p)) {
          var e = new Error("ENOENT: no such file or directory, open '" + String(p) + "'");
          e.code = 'ENOENT';
          flag('reading files other than stdin');
          throw e;
        }
        var enc = typeof opts === 'string' ? opts : (opts && opts.encoding);
        if (enc && !/^utf-?8$/i.test(String(enc))) flag('stdin read as ' + enc);
        return enc ? stdin : stdinBuffer();
      },
      writeSync: function (fd, data) {
        if (fd !== 1 && fd !== 2) { flag('writing files'); return 0; }
        var s = typeof data === 'string' ? data : String(data);
        write(fd === 1, s);
        return s.length;
      },
    }, {
      get: function (target, key) {
        if (key in target || typeof key === 'symbol') return target[key];
        flag('fs.' + String(key));
        return undefined;
      },
    });

    function createInterface(opts) {
      var input = opts && opts.input !== undefined ? opts.input : opts;
      var output = opts && opts.input !== undefined ? opts.output : arguments[1];
      if (input !== processStdin) flag('readline on something other than process.stdin');
      var toStdout = output === processStdout;
      if (output && !toStdout && output !== processStderr) flag('readline output');
      var rl = emitter({ closed: false, terminal: false, line: '' });
      var questions = [];
      var promptText = '> ';
      var iterQueue = [];
      var iterWaiters = [];
      var iterating = false;
      var lineEmitted = function (line) {
        if (questions.length) { var q = questions.shift(); q(line); return; }
        rl.emit('line', line);
        if (iterating) {
          if (iterWaiters.length) iterWaiters.shift()({ value: line, done: false }); else iterQueue.push(line);
        }
      };
      var closeOnce = function () {
        if (rl.closed) return;
        rl.closed = true;
        rl.emit('close');
        while (iterWaiters.length) iterWaiters.shift()({ value: undefined, done: true });
      };
      var writeOut = function (s) { if (output) write(toStdout, String(s)); };
      rl.close = function () { closeOnce(); };
      rl.pause = function () { return rl; };
      rl.resume = function () { return rl; };
      rl.setPrompt = function (p) { promptText = String(p); };
      rl.getPrompt = function () { return promptText; };
      rl.prompt = function () { writeOut(promptText); };
      rl.write = function (s) { if (typeof s === 'string') writeOut(s); };
      rl.question = function (query, optsOrCb, cb) {
        var fn = typeof optsOrCb === 'function' ? optsOrCb : cb;
        writeOut(query);
        questions.push(function (answer) { guarded(fn, rl, [answer]); });
      };
      rl[Symbol.asyncIterator] = function () {
        iterating = true;
        return {
          next: function () {
            if (iterQueue.length) return Promise.resolve({ value: iterQueue.shift(), done: false });
            if (rl.closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise(function (resolve) { iterWaiters.push(resolve); });
          },
          return: function () { closeOnce(); return Promise.resolve({ value: undefined, done: true }); },
          [Symbol.asyncIterator]: function () { return this; },
        };
      };
      // Node's readline splits on \r\n, \n or a lone \r and emits a last line without a newline at the end of input.
      stdinState.readline = function () {
        var lines = stdin.split(/\r\n|\n|\r/);
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        for (var i = 0; i < lines.length; i++) guarded(lineEmitted, null, [lines[i]]);
        later(closeOnce);
      };
      scheduleStdin();
      return rl;
    }
    var readlineModule = { createInterface: createInterface };

    var moduleObj = { exports: {}, id: '.', filename: '/home/main.js', loaded: false, children: [], paths: [] };
    var requireFn = function (name) {
      var n = String(name).replace(/^node:/, '');
      if (n === 'fs') return fsModule;
      if (n === 'readline') return readlineModule;
      flag('require("' + name + '")');
      var e = new Error("Cannot find module '" + name + "'");
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    };
    requireFn.main = moduleObj;

    function consoleWrite(toStdout) { return function () { write(toStdout, fmt(arguments) + '\n'); }; }
    var consoleObj = {
      log: consoleWrite(true), info: consoleWrite(true), debug: consoleWrite(true),
      error: consoleWrite(false), warn: consoleWrite(false),
      trace: function () { write(false, 'Trace: ' + fmt(arguments) + '\n'); },
      dir: function (v) { write(true, fmt([v]) + '\n'); },
      assert: function (ok) {
        if (ok) return;
        var rest = Array.prototype.slice.call(arguments, 1);
        write(false, 'Assertion failed' + (rest.length ? ': ' + fmt(rest) : '') + '\n');
      },
    };
    var consoleProxy = new Proxy(consoleObj, {
      get: function (target, key) {
        if (key in target || typeof key === 'symbol') return target[key];
        flag('console.' + String(key));
        return function () {};
      },
    });

    // Node's globals. They are globals (not wrapper parameters), so a program may still declare its own `process`.
    self.process = processProxy;
    self.console = consoleProxy;
    self.global = self;
    Object.keys(timers).forEach(function (k) { self[k] = timers[k]; });

    // Node's CommonJS wrapper: function (exports, require, module, __filename, __dirname) { ... } in sloppy mode
    var body = source.charAt(0) === '#' && source.charAt(1) === '!' ? '//' + source : source; // Node ignores a shebang line
    var program;
    try {
      program = Function('exports', 'require', 'module', '__filename', '__dirname', body);
    } catch (e) {
      compileOutput = '/home/main.js\n' + (e && e.stack ? String(e.stack).split('\n')[0] : String(e)) + '\n';
      finish('compile_error');
      return;
    }
    try {
      program.call(moduleObj.exports, moduleObj.exports, requireFn, moduleObj, '/home/main.js', '/home');
    } catch (e) {
      crash(e);
      return;
    }
    settle();
  }
}());
