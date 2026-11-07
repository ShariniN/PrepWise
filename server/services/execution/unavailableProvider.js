import { ExecutionUnavailableError } from './errors.js';

export default class UnavailableProvider {
  constructor(reason = 'No code execution provider is configured') {
    this.name = 'unavailable';
    this.reason = reason;
  }
  configured() { return false; }
  async run() { throw new ExecutionUnavailableError(this.reason, 'not_configured'); }
}
