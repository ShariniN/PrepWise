import axios from 'axios';
import { ExecutionUnavailableError, UnsupportedLanguageError } from './errors.js';
import { judge0IdFor, normalizeLanguage } from './languages.js';
import { mapJudge0Status, isFinalJudge0Status } from './verdicts.js';

const FIELDS = 'token,status_id,stdout,stderr,compile_output,message,time,memory';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Works with a self-hosted Judge0 CE, judge0.com hosted (X-Auth-Token) and RapidAPI (X-RapidAPI-Key + Host).
export default class Judge0Provider {
  constructor({ url, apiKey, apiHost, http = axios, pollIntervalMs = 700, maxPolls = 40, env = process.env } = {}) {
    this.name = 'judge0';
    this.url = String(url || '').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.apiHost = apiHost;
    this.http = http;
    this.pollIntervalMs = pollIntervalMs;
    this.maxPolls = maxPolls;
    this.env = env;
  }

  configured() { return !!this.url; }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiHost) {
      h['X-RapidAPI-Host'] = this.apiHost;
      if (this.apiKey) h['X-RapidAPI-Key'] = this.apiKey;
    } else if (this.apiKey) {
      h['X-Auth-Token'] = this.apiKey;
    }
    return h;
  }

  payload({ language, source, stdin, limits = {} }) {
    const canonical = normalizeLanguage(language);
    const id = canonical && judge0IdFor(canonical, this.env);
    if (!id) throw new UnsupportedLanguageError(language);
    const body = { language_id: id, source_code: source, stdin: stdin || '' };
    if (limits.timeMs) body.cpu_time_limit = Math.max(0.1, limits.timeMs / 1000);
    if (limits.memoryKb) body.memory_limit = limits.memoryKb;
    return body;
  }

  shape(sub, limits = {}) {
    const memoryKb = sub.memory ?? null;
    const status = mapJudge0Status(sub.status_id, { memoryKb, memoryLimitKb: limits.memoryKb });
    if (status === 'unavailable') {
      throw new ExecutionUnavailableError('The code runner reported an internal error.', 'provider_error');
    }
    return {
      status,
      stdout: sub.stdout || '',
      stderr: sub.stderr || sub.message || '',
      compileOutput: sub.compile_output || '',
      timeMs: sub.time == null ? null : Math.round(parseFloat(sub.time) * 1000),
      memoryKb,
    };
  }

  wrap(error) {
    if (error instanceof ExecutionUnavailableError || error instanceof UnsupportedLanguageError) return error;
    const code = error?.response?.status;
    if (code === 429) return new ExecutionUnavailableError('The code runner quota is exhausted. Try again later.', 'quota');
    if (code === 401 || code === 403) return new ExecutionUnavailableError('The code runner rejected our credentials.', 'auth');
    if (code === 400 || code === 422) return new ExecutionUnavailableError('The code runner rejected the request.', 'bad_request');
    return new ExecutionUnavailableError('The code runner could not be reached.', 'network');
  }

  async run(req) {
    const [result] = await this.runBatch([req]);
    return result;
  }

  // One POST for the whole batch, then poll until every submission is final.
  async runBatch(reqs) {
    if (!this.configured()) throw new ExecutionUnavailableError('JUDGE0_URL is not set', 'not_configured');
    if (!reqs.length) return [];
    const bodies = reqs.map((r) => this.payload(r)); // an unsupported language fails before any network call
    try {
      const created = await this.http.post(
        `${this.url}/submissions/batch?base64_encoded=false`,
        { submissions: bodies },
        { headers: this.headers(), timeout: 15000 },
      );
      const tokens = (created.data || []).map((s) => s?.token);
      if (tokens.length !== reqs.length || tokens.some((t) => !t)) {
        throw new ExecutionUnavailableError('The code runner returned an unexpected response.', 'bad_response');
      }
      const done = new Map();
      for (let attempt = 0; attempt < this.maxPolls && done.size < tokens.length; attempt += 1) {
        if (attempt > 0) await sleep(this.pollIntervalMs);
        const pending = tokens.filter((t) => !done.has(t));
        const res = await this.http.get(`${this.url}/submissions/batch`, {
          params: { tokens: pending.join(','), base64_encoded: false, fields: FIELDS },
          headers: this.headers(),
          timeout: 15000,
        });
        for (const sub of res.data?.submissions || []) {
          if (sub && isFinalJudge0Status(sub.status_id)) done.set(sub.token, sub);
        }
      }
      if (done.size < tokens.length) throw new ExecutionUnavailableError('The code runner took too long to answer.', 'poll_timeout');
      return tokens.map((t, i) => this.shape(done.get(t), reqs[i].limits));
    } catch (error) {
      throw this.wrap(error);
    }
  }
}
