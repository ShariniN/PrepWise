// One place for the Gemini model name. Google retires model names over time (gemini-2.5-flash,
// gemini-2.5-pro and gemini-2.0-flash all return 404 for new keys), so never hard-code it elsewhere.
// Override with GEMINI_MODEL in server/.env when Google retires this one.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
