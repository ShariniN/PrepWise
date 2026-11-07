// Cohort similarity. For each question: tokenise, normalise, hash k-grams, winnow, then compare submissions pairwise.
//
// Honest limits (also in API_PHASE3A.md):
//  - Similarity is a lead for a human, never proof. Short or boilerplate-heavy solutions look alike by nature;
//    `minTokens`, starter-code removal and the common-fingerprint filter reduce but do not remove false positives.
//  - Copying that restructures the program (reordered statements beyond k tokens, different algorithm, inlined
//    helpers) can score low. Two students who both followed the same lecture example can score high.
//  - It compares only submissions of the same question in the same language family and never across questions.
import { tokenize } from './tokenizer.js';
import { kgrams, winnow } from './winnow.js';

export const DEFAULTS = {
  k: 5,                  // tokens per k-gram
  w: 4,                  // winnowing window
  minTokens: 40,         // after removing starter code; shorter solutions are not compared
  minShared: 8,          // distinct shared fingerprints needed before a pair can be flagged
  threshold: 0.7,        // containment (shared / fingerprints of the smaller submission) needed to flag a pair
  reportFloor: 0.3,      // pairs below this are not reported at all
  commonFraction: 0.5,   // fingerprints present in more than this share of the cohort are boilerplate (cohorts of 5+)
};

const idOf = (v) => String(v);

// Fingerprints of one source. `starterHashes` (a Set of k-gram hashes of the question's starter code) are removed
// before winnowing, and tokens that only belong to starter k-grams do not count towards the token total.
export const fingerprint = (source, language, { starterHashes = new Set(), k = DEFAULTS.k, w = DEFAULTS.w } = {}) => {
  const tokens = tokenize(source, language);
  const types = tokens.map((t) => t.t);
  const all = kgrams(types, k);
  const own = all.filter((g) => !starterHashes.has(g.hash));
  const covered = new Uint8Array(types.length);
  for (const g of own) for (let i = g.pos; i < g.pos + k; i += 1) covered[i] = 1;
  const effectiveTokens = covered.reduce((a, b) => a + b, 0);
  const map = new Map(); // hash -> [positions]
  for (const g of winnow(own, w)) {
    if (!map.has(g.hash)) map.set(g.hash, []);
    map.get(g.hash).push(g.pos);
  }
  return { tokens, tokenCount: tokens.length, effectiveTokens, fingerprints: map, k };
};

export const starterFingerprints = (starterSource, language, k = DEFAULTS.k) =>
  new Set(starterSource ? kgrams(tokenize(starterSource, language).map((t) => t.t), k).map((g) => g.hash) : []);

// Merged 1-based line ranges covering the given k-gram start positions.
const lineRanges = (tokens, positions, k) => {
  const spans = positions.map((p) => [tokens[p].line, tokens[Math.min(p + k - 1, tokens.length - 1)].line]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of spans) {
    const last = out[out.length - 1];
    if (last && s <= last.endLine + 1) last.endLine = Math.max(last.endLine, e);
    else out.push({ startLine: s, endLine: e });
  }
  return out;
};

export const compare = (a, b, { threshold = DEFAULTS.threshold, minShared = DEFAULTS.minShared } = {}) => {
  const [small, large] = a.fingerprints.size <= b.fingerprints.size ? [a, b] : [b, a];
  const shared = [];
  for (const h of small.fingerprints.keys()) if (large.fingerprints.has(h)) shared.push(h);
  const minSize = Math.min(a.fingerprints.size, b.fingerprints.size);
  const union = a.fingerprints.size + b.fingerprints.size - shared.length;
  const containment = minSize ? shared.length / minSize : 0;
  return {
    shared: shared.length, containment, jaccard: union ? shared.length / union : 0,
    flagged: containment >= threshold && shared.length >= minShared,
    rangesA: lineRanges(a.tokens, shared.flatMap((h) => a.fingerprints.get(h)), a.k),
    rangesB: lineRanges(b.tokens, shared.flatMap((h) => b.fingerprints.get(h)), b.k),
  };
};

/**
 * submissions: [{ id, language, source }]  (one per student for one question)
 * starterCode: { [language]: source }  starter code is ignored in every comparison
 * Returns { compared, skipped: [{ id, reason }], pairs: [{ aId, bId, containment, jaccard, shared, flagged, rangesA, rangesB }] }
 * Pairs below `reportFloor` are omitted.
 */
export const compareCohort = (submissions, { starterCode = {}, ...options } = {}) => {
  const opt = { ...DEFAULTS, ...options };
  const prints = [];
  const skipped = [];
  const starters = new Map();
  for (const s of submissions) {
    const lang = String(s.language || 'javascript');
    if (!starters.has(lang)) starters.set(lang, starterFingerprints(starterCode[lang], lang, opt.k));
    const fp = fingerprint(s.source, lang, { starterHashes: starters.get(lang), k: opt.k, w: opt.w });
    if (fp.effectiveTokens < opt.minTokens) { skipped.push({ id: idOf(s.id), reason: 'too_short', tokens: fp.effectiveTokens }); continue; }
    prints.push({ id: idOf(s.id), language: lang, fp });
  }

  // Inverted index over fingerprints, ignoring boilerplate that most of the cohort shares.
  const index = new Map();
  for (const p of prints) for (const h of p.fp.fingerprints.keys()) { if (!index.has(h)) index.set(h, []); index.get(h).push(p); }
  const common = (list) => prints.length >= 5 && list.length / prints.length > opt.commonFraction;
  const effective = new Map(prints.map((p) => [p.id, new Map()]));
  for (const [h, list] of index) {
    if (common(list)) continue;
    for (const p of list) effective.get(p.id).set(h, p.fp.fingerprints.get(h));
  }
  const filtered = prints.map((p) => ({ ...p, fp: { ...p.fp, fingerprints: effective.get(p.id) } }));

  const candidates = new Set();
  for (const [h, list] of index) {
    if (common(list)) continue;
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) candidates.add(list[i].id < list[j].id ? `${list[i].id}|${list[j].id}` : `${list[j].id}|${list[i].id}`);
  }
  const byId = new Map(filtered.map((p) => [p.id, p]));
  const pairs = [];
  for (const key of candidates) {
    const [aId, bId] = key.split('|');
    const A = byId.get(aId);
    const B = byId.get(bId);
    if (A.language !== B.language || !A.fp.fingerprints.size || !B.fp.fingerprints.size) continue;
    const r = compare(A.fp, B.fp, opt);
    if (r.containment >= opt.reportFloor) pairs.push({ aId, bId, ...r });
  }
  pairs.sort((x, y) => y.containment - x.containment);
  return { compared: prints.length, skipped, pairs };
};
