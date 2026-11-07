// Original, dependency-free tokenizer for source-similarity checking. It is NOT a parser: it only needs to turn
// JavaScript, Python, Java and C-like sources (C, C++, C#, Go, PHP) into a stream of normalised tokens so that
// renaming variables, changing literals, adding comments or reformatting does not hide a copy.
//
// Normalisation:  comments and whitespace are dropped, every identifier becomes "ID", numbers become "NUM", string
// and character literals become "STR". Keywords and operators are kept. Semicolons are dropped (optional in JS,
// Python and Go, so they would only add noise).

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
]);

const C_KEYWORDS = new Set([
  'abstract', 'async', 'auto', 'await', 'bool', 'boolean', 'break', 'byte', 'case', 'catch', 'chan', 'char', 'class', 'const', 'continue',
  'default', 'defer', 'delete', 'do', 'double', 'else', 'enum', 'extends', 'extern', 'false', 'final', 'finally', 'float', 'for', 'foreach',
  'func', 'function', 'go', 'goto', 'if', 'implements', 'import', 'in', 'instanceof', 'int', 'interface', 'internal', 'let', 'long', 'map',
  'namespace', 'new', 'nil', 'null', 'nullptr', 'of', 'override', 'package', 'private', 'protected', 'public', 'range', 'readonly', 'ref',
  'register', 'return', 'select', 'short', 'signed', 'sizeof', 'static', 'string', 'struct', 'super', 'switch', 'template', 'this', 'throw',
  'throws', 'true', 'try', 'typedef', 'typeof', 'union', 'unsigned', 'using', 'var', 'virtual', 'void', 'volatile', 'while', 'yield',
]);

const OPS3 = new Set(['===', '!==', '<<=', '>>=', '**=', '//=', '...', '>>>', '<=>', '->*', '&&=', '||=', '??=']);
const OPS2 = new Set(['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '=>', '->', '::', '??', '?.', '**', '//', ':=']);

export const languageFamily = (language) => (String(language).toLowerCase().startsWith('py') ? 'python' : 'c');

const isIdStart = (c) => /[A-Za-z_$À-￿]/.test(c);
const isIdPart = (c) => /[A-Za-z0-9_$À-￿]/.test(c);

/**
 * Returns [{ t, line }] where `t` is the normalised token text and `line` the 1-based source line it starts on.
 */
export const tokenize = (source, language = 'javascript') => {
  const src = String(source ?? '').replace(/\r\n?/g, '\n');
  const py = languageFamily(language) === 'python';
  const keywords = py ? PY_KEYWORDS : C_KEYWORDS;
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const push = (t, ln) => out.push({ t, line: ln });

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line += 1; i += 1; continue; }
    if (c === ' ' || c === '\t' || c === '\f' || c === '\v') { i += 1; continue; }

    // comments
    if (c === '#' ) { while (i < n && src[i] !== '\n') i += 1; continue; } // python comment, C/PHP preprocessor line
    if (!py && c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (!py && c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line += 1; i += 1; }
      i += 2;
      continue;
    }

    // strings (python triple quotes may span lines; template literals too)
    if (c === '"' || c === "'" || c === '`') {
      const startLine = line;
      const triple = py && src.startsWith(c.repeat(3), i);
      if (triple) {
        i += 3;
        while (i < n && !src.startsWith(c.repeat(3), i)) { if (src[i] === '\n') line += 1; if (src[i] === '\\') i += 1; i += 1; }
        i += 3;
      } else {
        i += 1;
        while (i < n && src[i] !== c) {
          if (src[i] === '\\') i += 1;
          else if (src[i] === '\n' && c !== '`') break; // unterminated: stop at the line end
          if (src[i] === '\n') line += 1;
          i += 1;
        }
        i += 1;
      }
      push('STR', startLine);
      continue;
    }

    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const startLine = line;
      i += 1;
      while (i < n && /[0-9A-Za-z_.]/.test(src[i])) {
        if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '+' || src[i + 1] === '-')) i += 1;
        i += 1;
      }
      push('NUM', startLine);
      continue;
    }

    // identifiers and keywords
    if (isIdStart(c)) {
      const start = i;
      while (i < n && isIdPart(src[i])) i += 1;
      const word = src.slice(start, i);
      push(keywords.has(word) ? word : 'ID', line);
      continue;
    }

    // operators and punctuation
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (OPS3.has(three)) { push(three, line); i += 3; continue; }
    if (OPS2.has(two)) { push(two, line); i += 2; continue; }
    if (c !== ';') push(c, line);
    i += 1;
  }
  return out;
};
