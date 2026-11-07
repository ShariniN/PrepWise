// DEV TOOL (not imported by the app): turns the compact question definitions in ./defs into the seed JSON files in
// ../questions. Expected outputs are produced by running the JavaScript AND the Python reference solutions as real
// programs with stdin. The build fails if the two disagree, or if a hand-written expected output does not match,
// so every shipped test has been confirmed by two independent implementations.
//
// Usage: node seed/src/build.js        (needs `node` and `python` on PATH)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'questions');

// ---------- program generation ----------
const JS_PARSE = {
  int: (i) => `parseInt(line(${i}), 10)`,
  str: (i) => `line(${i})`,
  ints: (i) => `ints(line(${i}))`,
};
const JS_FMT = { int: 'result', str: 'result', bool: 'String(result)', ints: "result.join(' ')" };
const PY_PARSE = { int: (i) => `int(line(${i}))`, str: (i) => `line(${i})`, ints: (i) => `ints(line(${i}))` };
const PY_FMT = { int: 'result', str: 'result', bool: 'str(result).lower()', ints: "' '.join(map(str, result))" };
const JAVA_TYPE = { int: 'int', str: 'String', ints: 'int[]', bool: 'boolean' };
const JAVA_DEFAULT = { int: '0', str: '""', ints: 'new int[0]', bool: 'false' };
const JAVA_PARSE = { int: (i) => `Integer.parseInt(line(L, ${i}).trim())`, str: (i) => `line(L, ${i})`, ints: (i) => `ints(line(L, ${i}))` };
const JAVA_FMT = {
  int: 'result', str: 'result', bool: 'result',
  ints: 'Arrays.stream(result).mapToObj(String::valueOf).collect(java.util.stream.Collectors.joining(" "))',
};

const jsHarness = (d) => `// ---- reading input and printing the answer: nothing to change below this line ----
const L = require('fs').readFileSync(0, 'utf8').split('\\n').map((s) => s.replace(/\\r$/, ''));
const line = (i) => (i < L.length ? L[i] : '');
const ints = (s) => (s.trim() === '' ? [] : s.trim().split(/\\s+/).map(Number));
const result = solve(${d.params.map((p, i) => JS_PARSE[p[1]](i)).join(', ')});
console.log(${JS_FMT[d.ret[0]]});
`;
const jsStub = (d) => `function solve(${d.params.map((p) => p[0]).join(', ')}) {\n  // TODO: write your solution here\n}\n\n`;

const pyHarness = (d) => `
# ---- reading input and printing the answer: nothing to change below this line ----
import sys
_L = sys.stdin.read().split('\\n')
def line(i):
    return _L[i].rstrip('\\r') if i < len(_L) else ''
def ints(s):
    s = s.strip()
    return [int(x) for x in s.split()] if s else []
result = solve(${d.params.map((p, i) => PY_PARSE[p[1]](i)).join(', ')})
print(${PY_FMT[d.ret[0]]})
`;
const pyStub = (d) => `def solve(${d.params.map((p) => p[0]).join(', ')}):\n    # TODO: write your solution here\n    pass\n`;

const javaStarter = (d) => `import java.io.*;
import java.util.*;

public class Main {
    static ${JAVA_TYPE[d.ret[0]]} solve(${d.params.map((p) => `${JAVA_TYPE[p[1]]} ${p[0]}`).join(', ')}) {
        // TODO: write your solution here
        return ${JAVA_DEFAULT[d.ret[0]]};
    }

    // ---- reading input and printing the answer: nothing to change below this line ----
    static String line(List<String> L, int i) { return i < L.size() ? L.get(i).replace("\\r", "") : ""; }
    static int[] ints(String s) {
        s = s.trim();
        if (s.isEmpty()) return new int[0];
        String[] parts = s.split("\\\\s+");
        int[] out = new int[parts.length];
        for (int i = 0; i < parts.length; i++) out[i] = Integer.parseInt(parts[i]);
        return out;
    }
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        List<String> L = new ArrayList<>();
        String s;
        while ((s = br.readLine()) != null) L.add(s);
        ${JAVA_TYPE[d.ret[0]]} result = solve(${d.params.map((p, i) => JAVA_PARSE[p[1]](i)).join(', ')});
        System.out.println(${JAVA_FMT[d.ret[0]]});
    }
}
`;

const toInput = (d, args) => args.map((a, i) => (d.params[i][1] === 'ints' ? a.join(' ') : String(a))).join('\n') + '\n';

// ---------- running ----------
const runProgram = (cmd, args, file, source, input) => {
  fs.writeFileSync(file, source);
  const r = spawnSync(cmd, [...args, file], { input, encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${r.stderr || r.error}`);
  return r.stdout;
};
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
const tmp = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '.', 'seedbuild-'));
const jsFile = path.join(tmp, 'ref.js');
const pyFile = path.join(tmp, 'ref.py');

const buildCoding = (d) => {
  const jsRef = `${d.js.trim()}\n\n${jsHarness(d)}`;
  const pyRef = `${d.py.trim()}\n${pyHarness(d)}`;
  const tests = d.tests.map(([args, visible, out], n) => {
    const input = toInput(d, args);
    const fromJs = norm(runProgram('node', [], jsFile, jsRef, input));
    const fromPy = norm(runProgram('python', ['-I'], pyFile, pyRef, input));
    if (fromJs !== fromPy) throw new Error(`${d.slug} test ${n + 1}: JS gave ${JSON.stringify(fromJs)} but Python gave ${JSON.stringify(fromPy)}`);
    if (out !== undefined && norm(String(out)) !== fromJs) throw new Error(`${d.slug} test ${n + 1}: hand-written ${JSON.stringify(out)} but solutions gave ${JSON.stringify(fromJs)}`);
    return { input: input.replace(/\n$/, ''), expectedOutput: fromJs, visible: !!visible, weight: 1, comparison: 'trim' };
  });
  if (tests.length < 3 || tests.length > 8) throw new Error(`${d.slug}: needs 3-8 tests, has ${tests.length}`);
  if (!tests.some((t) => t.visible) || !tests.some((t) => !t.visible)) throw new Error(`${d.slug}: needs both visible and hidden tests`);
  if (new Set(tests.map((t) => t.input)).size !== tests.length) throw new Error(`${d.slug}: duplicate test inputs`);
  const first = tests.find((t) => t.visible);
  const desc = { int: 'an integer', str: 'a line of text', ints: 'space-separated integers (an empty line means an empty list)', bool: 'true or false' };
  const statement = `${d.text.trim()}

**Input** (standard input), one line each:
${d.params.map((p, i) => `${i + 1}. \`${p[0]}\`: ${p[2] || desc[p[1]]}`).join('\n')}

**Output** (standard output): ${d.ret[1]}

**Example**

Input:
\`\`\`
${first.input}
\`\`\`
Output:
\`\`\`
${first.expectedOutput}
\`\`\`
`;
  return {
    slug: d.slug, title: d.title, type: 'coding', topic: d.topic, difficulty: d.diff, estimatedMinutes: d.min || 10,
    learningOutcome: d.outcome || '', languages: ['javascript', 'python', 'java'], timeLimitMs: 2000, statement,
    starterCode: { javascript: jsStub(d) + jsHarness(d), python: pyStub(d) + pyHarness(d), java: javaStarter(d) },
    referenceSolutions: { javascript: jsRef, python: pyRef }, tests,
  };
};

const buildMcq = (d) => {
  if (d.options.length < 3 || !d.correct.length) throw new Error(`${d.slug}: bad mcq`);
  return {
    slug: d.slug, title: d.title, type: 'mcq', topic: d.topic, difficulty: d.diff, estimatedMinutes: 2, languages: [],
    statement: d.text, options: d.options, correct: d.correct, multi: d.correct.length > 1, explanation: d.why,
  };
};

const buildTrace = (d) => {
  const run = d.lang === 'python' ? runProgram('python', ['-I'], pyFile, d.code, '') : runProgram('node', [], jsFile, d.code, '');
  if (norm(run) !== norm(d.answer)) throw new Error(`${d.slug}: hand-written answer ${JSON.stringify(d.answer)} but the code printed ${JSON.stringify(norm(run))}`);
  const fence = d.lang === 'python' ? 'python' : 'javascript';
  return {
    slug: d.slug, title: d.title, type: 'trace', topic: d.topic, difficulty: d.diff, estimatedMinutes: 3, languages: [],
    statement: `${d.text.trim()}\n\n\`\`\`${fence}\n${d.code.trim()}\n\`\`\`\n\nType exactly what the program prints. Use one line per line of output.`,
    traceAnswer: norm(d.answer), explanation: d.why,
  };
};

const FILES = {
  'fundamentals': './defs/fundamentals.js',
  'arrays-strings': './defs/arrays-strings.js',
  'recursion': './defs/recursion.js',
  'sorting-searching': './defs/sorting-searching.js',
  'data-structures': './defs/data-structures.js',
  'oop': './defs/oop.js',
  'algorithms': './defs/algorithms.js',
  'mcq': './defs/mcq.js',
  'trace': './defs/trace.js',
};

const slugs = new Set();
for (const [name, mod] of Object.entries(FILES)) {
  const { default: defs } = await import(mod);
  const built = defs.map((d) => {
    if (slugs.has(d.slug)) throw new Error(`duplicate slug ${d.slug}`);
    slugs.add(d.slug);
    return d.kind === 'mcq' ? buildMcq(d) : d.kind === 'trace' ? buildTrace(d) : buildCoding(d);
  });
  fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(built, null, 2)}\n`);
  console.log(`${name}: ${built.length} questions`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`total ${slugs.size}`);
