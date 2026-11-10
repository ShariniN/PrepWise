export class ExecutionUnavailableError extends Error {
  constructor(message = 'Code execution is currently unavailable', reason = 'unavailable') {
    super(message);
    this.name = 'ExecutionUnavailableError';
    this.code = 'EXECUTION_UNAVAILABLE';
    this.status = 503;
    this.reason = reason;
  }
}

// What the student or lecturer is told for each reason. Internal details (provider names, raw errors) stay in the log.
const FRIENDLY = {
  quota: 'Code execution limit for today has been reached. Try again tomorrow.',
  network: 'The code runner could not be reached. Try again in a few minutes.',
  auth: 'The code runner is not set up correctly. Please tell your lecturer.',
  not_configured: 'Code execution is not set up on this server.',
  bad_response: 'The code runner sent back an unexpected answer. Try again in a few minutes.',
};
export const friendlyUnavailable = (error) => FRIENDLY[error?.reason] || 'Code execution is currently unavailable. Try again in a few minutes.';
export const unavailableReason = (error) => (FRIENDLY[error?.reason] ? error.reason : 'unavailable');

export class UnsupportedLanguageError extends Error {
  constructor(language) {
    super(`Unsupported language: ${language}`);
    this.name = 'UnsupportedLanguageError';
    this.code = 'UNSUPPORTED_LANGUAGE';
    this.status = 400;
  }
}
