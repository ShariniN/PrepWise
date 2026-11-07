export class ExecutionUnavailableError extends Error {
  constructor(message = 'Code execution is currently unavailable', reason = 'unavailable') {
    super(message);
    this.name = 'ExecutionUnavailableError';
    this.code = 'EXECUTION_UNAVAILABLE';
    this.status = 503;
    this.reason = reason;
  }
}

export class UnsupportedLanguageError extends Error {
  constructor(language) {
    super(`Unsupported language: ${language}`);
    this.name = 'UnsupportedLanguageError';
    this.code = 'UNSUPPORTED_LANGUAGE';
    this.status = 400;
  }
}
