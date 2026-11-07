// The single path for running student code. Nothing here ever invents output: if no provider can run the
// code, callers get ExecutionUnavailableError and must not record a score.
import crypto from 'node:crypto';
import Judge0Provider from './judge0Provider.js';
import JDoodleProvider from './jdoodleProvider.js';
import UnavailableProvider from './unavailableProvider.js';
import { UnsupportedLanguageError } from './errors.js';
import { normalizeLanguage, supportedLanguages } from './languages.js';

export { ExecutionUnavailableError, UnsupportedLanguageError } from './errors.js';
export { VERDICTS } from './verdicts.js';

export const DEFAULT_LIMITS = { timeMs: 2000, memoryKb: 256000 };
export const MAX_SOURCE_CHARS = 64 * 1024;
export const MAX_STDIN_CHARS = 16 * 1024;

// ---- tiny LRU with a TTL (Map keeps insertion order, so the first key is the least recently used) ----
export class RunCache {
  constructor({ max = 500, ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) { this.map.delete(key); return undefined; }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, at: this.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

let cache = new RunCache();
export const resetCache = (options) => { cache = new RunCache(options); };

// ---- provider selection ----
let override = null;
export const setProvider = (provider) => { override = provider; }; // tests inject a fake; null restores env selection

export const providerFromEnv = (env = process.env) => {
  const choice = String(env.EXECUTION_PROVIDER || '').trim().toLowerCase();
  const judge0 = () => new Judge0Provider({ url: env.JUDGE0_URL, apiKey: env.JUDGE0_API_KEY, apiHost: env.JUDGE0_API_HOST, env });
  const jdoodle = () => new JDoodleProvider({ clientId: env.JDOODLE_CLIENT_ID, clientSecret: env.JDOODLE_CLIENT_SECRET });
  let provider;
  if (choice === 'judge0') provider = judge0();
  else if (choice === 'jdoodle') provider = jdoodle();
  else if (choice) return new UnavailableProvider(`Unknown EXECUTION_PROVIDER "${choice}"`);
  else if (env.JUDGE0_URL) provider = judge0(); // not set explicitly: use whatever is configured, Judge0 first
  else if (env.JDOODLE_CLIENT_ID && env.JDOODLE_CLIENT_SECRET) provider = jdoodle();
  else return new UnavailableProvider();
  return provider.configured() ? provider : new UnavailableProvider(`EXECUTION_PROVIDER=${provider.name} is not fully configured`);
};

export const getProvider = () => override || providerFromEnv();

export const status = () => {
  const p = getProvider();
  return { provider: p.name, configured: p.configured ? p.configured() : true, languages: supportedLanguages() };
};

// ---- running ----
const keyOf = (provider, { language, source, stdin, limits }) =>
  crypto.createHash('sha256')
    .update(JSON.stringify([provider.name, language, source, stdin || '', limits?.timeMs || 0, limits?.memoryKb || 0]))
    .digest('hex');

const prepare = (req) => {
  const language = normalizeLanguage(req.language);
  if (!language) throw new UnsupportedLanguageError(req.language);
  return { language, source: String(req.source ?? ''), stdin: String(req.stdin ?? ''), limits: { ...DEFAULT_LIMITS, ...(req.limits || {}) } };
};

export const run = async (req) => (await runMany([req]))[0];

// Runs many submissions; uses the provider's batch endpoint when it has one.
export const runMany = async (reqs) => {
  const provider = getProvider();
  const prepared = reqs.map(prepare);
  const keys = prepared.map((p) => keyOf(provider, p));
  const results = keys.map((k) => cache.get(k));
  const missing = results.map((r, i) => (r === undefined ? i : -1)).filter((i) => i >= 0);
  if (missing.length) {
    const fresh = typeof provider.runBatch === 'function'
      ? await provider.runBatch(missing.map((i) => prepared[i]))
      : await mapLimit(missing, 4, (i) => provider.run(prepared[i]));
    missing.forEach((idx, n) => { results[idx] = fresh[n]; cache.set(keys[idx], fresh[n]); });
  }
  return results.map((r) => ({ ...r }));
};

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next; next += 1;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
