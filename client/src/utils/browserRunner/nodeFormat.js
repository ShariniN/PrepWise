// Node's console.log formatting (util.format + util.inspect with the default options: breakLength 80, compact 3,
// depth 2), for the values a practice program prints: strings, numbers, bigints, booleans, null/undefined,
// symbols, and plain arrays / objects of those (up to three levels deep).
//
// This file is loaded as raw text into the JavaScript worker (see jsRunner.js), so it must stay a plain script:
// no imports or exports. Anything outside the supported set throws `Unmatchable`; the runner then falls back to the
// server, because "probably the same as Node" is not good enough when output is compared with expected output.
// tools/e2e/browser-runner-format.mjs checks this file against the real util.format.
globalThis.PrepwiseNodeFormat = (function nodeFormat() {
  'use strict';

  var BREAK = 80;
  var COMPACT = 3;
  var KEY = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

  function Unmatchable(reason) { this.reason = reason; }

  function num(n) { return Object.is(n, -0) ? '-0' : String(n); }

  // util.inspect quoting for strings. Strings that Node would escape are not supported.
  function quote(s) {
    if (s.length > 10000) throw new Unmatchable('a very long string');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x20 || c === 0x5c || (c >= 0x7f && c <= 0x9f)) throw new Unmatchable('a string with escaped characters');
      if (c >= 0xd800 && c <= 0xdbff) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; }
        throw new Unmatchable('a string with a broken character');
      }
      if (c >= 0xdc00 && c <= 0xdfff) throw new Unmatchable('a string with a broken character');
    }
    if (s.indexOf("'") < 0) return "'" + s + "'";
    if (s.indexOf('"') < 0) return '"' + s + '"';
    if (s.indexOf('`') < 0 && s.indexOf('${') < 0) return '`' + s + '`';
    throw new Unmatchable('a string with every kind of quote');
  }

  // inspect() of a primitive, or undefined when v is not a primitive
  function primitive(v) {
    switch (typeof v) {
      case 'number': return num(v);
      case 'bigint': return String(v) + 'n';
      case 'boolean': return String(v);
      case 'undefined': return 'undefined';
      case 'string': return quote(v);
      case 'symbol': throw new Unmatchable('a symbol');
      default: return v === null ? 'null' : undefined;
    }
  }

  // Node's groupArrayElements (lib/internal/util/inspect.js) for arrays of more than six primitives.
  function groupArrayElements(output, indent, value) {
    var totalLength = 0;
    var maxLength = 0;
    var sep = 2;
    var dataLen = [];
    var i;
    for (i = 0; i < output.length; i++) {
      var len = output[i].length;
      dataLen.push(len);
      totalLength += len + sep;
      if (maxLength < len) maxLength = len;
    }
    var actualMax = maxLength + sep;
    if (actualMax * 3 + indent < BREAK && (totalLength / actualMax > 5 || maxLength <= 6)) {
      var averageBias = Math.sqrt(actualMax - totalLength / output.length);
      var biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      var columns = Math.min(
        Math.round(Math.sqrt(2.5 * biasedMax * output.length) / biasedMax),
        Math.floor((BREAK - indent) / actualMax),
        COMPACT * 4,
        15,
      );
      if (columns <= 1) return output;
      var maxLineLength = [];
      for (i = 0; i < columns; i++) {
        var lineLength = 0;
        for (var j = i; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
        maxLineLength.push(lineLength + sep);
      }
      var padStart = true;
      for (i = 0; i < output.length; i++) {
        if (typeof value[i] !== 'number' && typeof value[i] !== 'bigint') { padStart = false; break; }
      }
      var rows = [];
      for (i = 0; i < output.length; i += columns) {
        var max = Math.min(i + columns, output.length);
        var str = '';
        var k = i;
        for (; k < max - 1; k++) {
          var cell = output[k] + ', ';
          str += padStart ? cell.padStart(maxLineLength[k - i], ' ') : cell.padEnd(maxLineLength[k - i], ' ');
        }
        str += padStart ? output[k].padStart(maxLineLength[k - i] - sep, ' ') : output[k];
        rows.push(str);
      }
      return rows;
    }
    return output;
  }

  function isBelowBreakLength(output, start) {
    var total = output.length + start;
    if (total + output.length > BREAK) return false;
    for (var i = 0; i < output.length; i++) {
      total += output[i].length;
      if (total > BREAK) return false;
    }
    return true;
  }

  function reduceToSingleString(output, braces, isArray, indent, value) {
    var entries = output.length;
    if (isArray && entries > 6) output = groupArrayElements(output, indent, value);
    if (entries === output.length) {
      var start = output.length + indent + braces[0].length + 10;
      if (isBelowBreakLength(output, start)) {
        var joined = output.join(', ');
        if (joined.indexOf('\n') < 0) return braces[0] + ' ' + joined + ' ' + braces[1];
      }
    }
    var nl = '\n' + ' '.repeat(indent);
    return braces[0] + nl + '  ' + output.join(',' + nl + '  ') + nl + braces[1];
  }

  // util.inspect(v) for the supported values. `indent` is Node's ctx.indentationLvl, `level` the nesting depth.
  function inspect(v, indent, level) {
    var p = primitive(v);
    if (p !== undefined) return p;
    if (typeof v === 'function') throw new Unmatchable('a function');
    if (level > 2) throw new Unmatchable('a deeply nested value');
    var isArray = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (isArray ? Array.prototype : Object.prototype)) throw new Unmatchable('this kind of object');
    if (Object.getOwnPropertySymbols(v).length) throw new Unmatchable('an object with symbol keys');
    var keys = Object.keys(v);
    var output = [];
    var i;
    if (isArray) {
      if (keys.length !== v.length) throw new Unmatchable('an array with holes or extra properties');
      if (v.length > 100) throw new Unmatchable('a long array');
      for (i = 0; i < v.length; i++) {
        if (v.length > 6 && v[i] !== null && (typeof v[i] === 'object' || typeof v[i] === 'function')) {
          throw new Unmatchable('a long array of arrays or objects');
        }
        output.push(inspect(v[i], indent + 2, level + 1));
      }
    } else {
      for (i = 0; i < keys.length; i++) {
        var desc = Object.getOwnPropertyDescriptor(v, keys[i]);
        if (desc.get || desc.set) throw new Unmatchable('an object with getters');
        var name = KEY.test(keys[i]) ? keys[i] : quote(keys[i]);
        output.push(name + ': ' + inspect(desc.value, indent + 2, level + 1));
      }
    }
    if (!output.length) return isArray ? '[]' : '{}';
    return reduceToSingleString(output, isArray ? ['[', ']'] : ['{', '}'], isArray, indent, v);
  }

  function inspectTop(v) { return inspect(v, 0, 0); }

  // util.format(...args), ported from formatWithOptionsInternal
  function format(args) {
    var first = args[0];
    var a = 0;
    var str = '';
    var join = '';
    if (typeof first === 'string') {
      if (args.length === 1) return first;
      var tempStr;
      var lastPos = 0;
      for (var i = 0; i < first.length - 1; i++) {
        if (first.charCodeAt(i) === 37) { // '%'
          var nextChar = first.charCodeAt(++i);
          if (a + 1 !== args.length) {
            var arg;
            switch (nextChar) {
              case 115: // 's'
                arg = args[++a];
                if (typeof arg === 'number') tempStr = num(arg);
                else if (typeof arg === 'bigint') tempStr = String(arg) + 'n';
                else if (typeof arg === 'symbol') throw new Unmatchable('a symbol');
                else if (typeof arg !== 'object' || arg === null) tempStr = String(arg);
                else throw new Unmatchable('%s with an object');
                break;
              case 106: // 'j'
                arg = args[++a];
                try { tempStr = JSON.stringify(arg); } catch { throw new Unmatchable('%j with a circular value'); }
                if (tempStr === undefined) tempStr = 'undefined';
                break;
              case 100: // 'd'
                arg = args[++a];
                if (typeof arg === 'bigint') tempStr = String(arg) + 'n';
                else if (typeof arg === 'symbol') tempStr = 'NaN';
                else tempStr = num(Number(arg));
                break;
              case 79: // 'O'
                tempStr = inspectTop(args[++a]);
                break;
              case 111: // 'o'
                arg = args[++a];
                if (arg !== null && (typeof arg === 'object' || typeof arg === 'function')) throw new Unmatchable('%o with an object');
                tempStr = inspectTop(arg);
                break;
              case 105: // 'i'
                arg = args[++a];
                if (typeof arg === 'bigint') tempStr = String(arg) + 'n';
                else if (typeof arg === 'symbol') tempStr = 'NaN';
                else tempStr = num(parseInt(arg));
                break;
              case 102: // 'f'
                arg = args[++a];
                if (typeof arg === 'symbol') tempStr = 'NaN';
                else tempStr = num(parseFloat(arg));
                break;
              case 99: // 'c'
                a += 1;
                tempStr = '';
                break;
              case 37: // '%'
                str += first.slice(lastPos, i);
                lastPos = i + 1;
                continue;
              default:
                continue;
            }
            if (lastPos !== i - 1) str += first.slice(lastPos, i - 1);
            str += tempStr;
            lastPos = i + 1;
          } else if (nextChar === 37) {
            str += first.slice(lastPos, i);
            lastPos = i + 1;
          }
        }
      }
      if (lastPos !== 0) {
        a++;
        join = ' ';
        if (lastPos < first.length) str += first.slice(lastPos);
      }
    }
    while (a < args.length) {
      var value = args[a];
      str += join;
      str += typeof value !== 'string' ? inspectTop(value) : value;
      join = ' ';
      a++;
    }
    return str;
  }

  return { format: format, inspect: inspectTop, Unmatchable: Unmatchable };
}());
