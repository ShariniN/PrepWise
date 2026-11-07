// k-gram hashing and winnowing (Schleimer, Wilkerson, Aiken: "Winnowing: Local Algorithms for Document
// Fingerprinting"). Any shared run of at least w + k - 1 tokens is guaranteed to share at least one fingerprint.

// 32-bit FNV-1a over the k tokens joined with a separator that cannot occur inside a token.
export const hashTokens = (tokens, from, k) => {
  let h = 0x811c9dc5;
  for (let i = from; i < from + k; i += 1) {
    const t = tokens[i];
    for (let j = 0; j < t.length; j += 1) { h ^= t.charCodeAt(j); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x1f; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

// All k-gram hashes as [{ hash, pos }] where pos is the index of the first token.
export const kgrams = (tokens, k) => {
  const out = [];
  for (let i = 0; i + k <= tokens.length; i += 1) out.push({ hash: hashTokens(tokens, i, k), pos: i });
  return out;
};

// Picks the minimum hash of every window of w consecutive k-grams (rightmost on ties). `grams` may have gaps in
// `pos` (starter-code k-grams removed); windows are over the remaining list.
export const winnow = (grams, w) => {
  if (!grams.length) return [];
  if (grams.length <= w) {
    let best = grams[0];
    for (const g of grams) if (g.hash <= best.hash) best = g;
    return [best];
  }
  const chosen = new Map();
  for (let i = 0; i + w <= grams.length; i += 1) {
    let best = grams[i];
    for (let j = i; j < i + w; j += 1) if (grams[j].hash <= best.hash) best = grams[j];
    chosen.set(best.pos, best);
  }
  return [...chosen.values()];
};
