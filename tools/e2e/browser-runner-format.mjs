// Checks the in-browser JavaScript runner's console.log formatting (client/src/utils/browserRunner/nodeFormat.js)
// against the real util.format of this Node. Every value it claims to support must format byte for byte the same;
// anything else must be refused (the runner then uses the server). No browser, no server.
// Usage: node browser-runner-format.mjs [cases=30000]
import fs from 'node:fs';
import util from 'node:util';

const src = fs.readFileSync(new URL('../../client/src/utils/browserRunner/nodeFormat.js', import.meta.url), 'utf8');
new Function(src)(); // defines globalThis.PrepwiseNodeFormat in this realm
const F = globalThis.PrepwiseNodeFormat;

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const STR_CHARS = ['a', 'b', 'Z', ' ', '1', "'", '"', '`', '$', '{', '-', '_', 'é', '😀', '%', 's', 'd'];
const str = () => Array.from({ length: Math.floor(rnd() * (rnd() < 0.1 ? 40 : 8)) }, () => pick(STR_CHARS)).join('');
const prim = () => {
  const r = rnd();
  if (r < 0.35) return Math.floor(rnd() * (rnd() < 0.5 ? 10 : 100000)) * (rnd() < 0.2 ? -1 : 1);
  if (r < 0.45) return pick([0.5, -0, 1e21, 1 / 3, NaN, Infinity, -Infinity, 123.456]);
  if (r < 0.7) return str();
  if (r < 0.75) return BigInt(Math.floor(rnd() * 1e6));
  if (r < 0.85) return pick([true, false, null, undefined]);
  return Math.floor(rnd() * 3);
};
const value = (depth = 0) => {
  const r = rnd();
  if (depth > 2 || r < 0.4) return prim();
  const n = Math.floor(rnd() * (rnd() < 0.3 ? 40 : 9));
  if (r < 0.75) return Array.from({ length: n }, () => (rnd() < 0.8 ? prim() : value(depth + 1)));
  const o = {};
  for (let i = 0; i < n; i++) o[rnd() < 0.8 ? pick(['a', 'b', 'key', 'x1', '_y', 'name']) + i : str()] = rnd() < 0.8 ? prim() : value(depth + 1);
  return o;
};
const argsCase = () => {
  const r = rnd();
  if (r < 0.2) return [value()];
  if (r < 0.4) return Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => value());
  const fmt = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => pick(['%s', '%d', '%i', '%f', '%j', '%o', '%O', '%c', '%%', '%x', 'a', ' ', '%'])).join('');
  return [fmt, ...Array.from({ length: Math.floor(rnd() * 4) }, () => value())];
};

const FIXED = [
  [[1, 2, 3, 4, 5, 6, 7]], [Array.from({ length: 6 }, () => 'a'.repeat(20))], [[[1, 2], [3, 4]]], [{ a: 1, 'b-c': 'x', d: [1, 2] }],
  [["it's"], ['a"b\'c']], [-0, [-0], 5n, [undefined, null, true]], ['%d%%', 5, 'extra', { x: 1 }], ['100%%'], ['%s is %d', 'x', 42],
  [Array.from({ length: 30 }, (_, i) => i * 37)], [Array.from({ length: 100 }, (_, i) => i)], [Array.from({ length: 12 }, (_, i) => 'w' + i)],
  [{ matrix: [[1, 2, 3], [4, 5, 6]], ok: true }], [[]], [{}], ['a', 1, 'b'], [], [''], [' '], ['%c styled', 'color: red'],
  [Array.from({ length: 7 }, () => 'x'.repeat(30))], [[1.5, -2, 3e-7, 4, 5, 6, 7, 8]], [[1n, 2n, 3n, 4n, 5n, 6n, 7n]],
];

const N = Number(process.argv[2]) || 30000;
let same = 0;
let refused = 0;
const bad = [];
const check = (args) => {
  let mine;
  try { mine = F.format(args); } catch (e) {
    if (e instanceof F.Unmatchable) { refused += 1; return; }
    throw e;
  }
  const real = util.format(...args);
  if (mine === real) same += 1;
  else if (bad.length < 10) bad.push({ args: util.inspect(args, { depth: 5 }), mine, real });
  else bad.push(null);
};
for (const a of FIXED) check(a);
for (let i = 0; i < N; i++) check(argsCase());

console.log(`node ${process.version}: ${same} identical, ${refused} refused (would use the server), ${bad.length} different`);
for (const b of bad.filter(Boolean)) console.log('DIFF', b.args, '\n  mine:', JSON.stringify(b.mine), '\n  node:', JSON.stringify(b.real));
process.exit(bad.length ? 1 : 0);
