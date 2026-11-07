import axios from 'axios';
import { ExecutionUnavailableError, UnsupportedLanguageError } from './errors.js';
import { LANGUAGES, normalizeLanguage } from './languages.js';

// Backup provider. JDoodle returns only the combined output and no final status, so the verdict is inferred
// from that output. This is less precise than Judge0 (it cannot separate stderr from stdout); prefer Judge0.
export default class JDoodleProvider {
  constructor({ clientId, clientSecret, http = axios, url = 'https://api.jdoodle.com/v1/execute' } = {}) {
    this.name = 'jdoodle';
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.http = http;
    this.url = url;
  }

  configured() {
    return !!(this.clientId && this.clientSecret
      && this.clientId !== 'your_jdoodle_client_id' && this.clientSecret !== 'your_jdoodle_client_secret');
  }

  async run({ language, source, stdin }) {
    if (!this.configured()) throw new ExecutionUnavailableError('JDoodle credentials are not set', 'not_configured');
    const canonical = normalizeLanguage(language);
    if (!canonical) throw new UnsupportedLanguageError(language);
    const { language: lang, versionIndex } = LANGUAGES[canonical].jdoodle;
    let data;
    try {
      ({ data } = await this.http.post(this.url, {
        script: source, language: lang, versionIndex, stdin: stdin || '',
        clientId: this.clientId, clientSecret: this.clientSecret,
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }));
    } catch (error) {
      const code = error?.response?.status;
      if (code === 429) throw new ExecutionUnavailableError('The code runner quota is exhausted. Try again later.', 'quota');
      if (code === 401 || code === 403) throw new ExecutionUnavailableError('The code runner rejected our credentials.', 'auth');
      throw new ExecutionUnavailableError('The code runner could not be reached.', 'network');
    }
    if (!data || typeof data !== 'object' || data.output === undefined) {
      throw new ExecutionUnavailableError('The code runner returned an unexpected response.', 'bad_response');
    }
    const output = String(data.output ?? '');
    const status = this.classify(output);
    return {
      status,
      stdout: status === 'accepted' ? output : '',
      stderr: status === 'accepted' || status === 'compile_error' ? '' : output,
      compileOutput: status === 'compile_error' ? output : '',
      timeMs: data.cpuTime == null ? null : Math.round(parseFloat(data.cpuTime) * 1000),
      memoryKb: data.memory == null ? null : parseInt(data.memory, 10),
    };
  }

  classify(output) {
    if (/JDoodle - Timeout|Time limit exceeded/i.test(output)) return 'time_limit';
    if (/Memory limit|out of memory|OutOfMemoryError|std::bad_alloc/i.test(output)) return 'memory_limit';
    if (/Traceback \(most recent call last\)|Exception in thread|Uncaught |ReferenceError|TypeError|panic:|Segmentation fault/.test(output)) return 'runtime_error';
    if (/SyntaxError|cannot find symbol|compilation (failed|terminated)|undefined reference|error:/i.test(output)) return 'compile_error';
    return 'accepted';
  }
}
