// Free-form "run my code" for the interview page and the old editor. Same single execution service as everything else.
import { run, status, MAX_SOURCE_CHARS, MAX_STDIN_CHARS, ExecutionUnavailableError, UnsupportedLanguageError } from '../services/execution/index.js';

// Response keeps the shape the client already reads: success, output, error, executionTime (seconds), memory (KB), statusCode.
// New field `verdict` is additive.
export const executeCode = async (req, res) => {
  const { script, language, stdin } = req.body || {};
  if (typeof script !== 'string' || !script.trim() || typeof language !== 'string' || !language.trim()) {
    return res.status(400).json({ success: false, error: 'Missing required fields: script and language are required' });
  }
  if (script.length > MAX_SOURCE_CHARS || String(stdin || '').length > MAX_STDIN_CHARS) {
    return res.status(413).json({ success: false, error: 'Code or input is too large' });
  }
  try {
    const r = await run({ language, source: script, stdin: typeof stdin === 'string' ? stdin : '' });
    const ok = r.status === 'accepted';
    return res.json({
      success: ok,
      verdict: r.status,
      output: r.stdout || '',
      error: r.compileOutput || r.stderr || '',
      executionTime: r.timeMs == null ? null : String(r.timeMs / 1000),
      memory: r.memoryKb == null ? null : String(r.memoryKb),
      statusCode: 200,
    });
  } catch (error) {
    if (error instanceof ExecutionUnavailableError) {
      return res.status(503).json({ success: false, verdict: 'unavailable', error: 'Code execution is currently unavailable. Your work has not been scored.' });
    }
    if (error instanceof UnsupportedLanguageError) {
      return res.status(400).json({ success: false, error: `${error.message}. Supported languages: JavaScript, Python, Java, C++, C, C#, PHP, Go` });
    }
    console.error('Code execution failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to execute code. Please try again.' });
  }
};

export const executionHealth = (req, res) => {
  const s = status();
  res.json({
    success: true,
    provider: s.provider,
    configured: s.configured,
    supportedLanguages: s.languages,
    languages: s.languages.map((name) => ({ name })),
    ...(s.configured ? {} : { warning: 'No code execution provider is configured; code execution is unavailable' }),
    timestamp: new Date().toISOString(),
  });
};
