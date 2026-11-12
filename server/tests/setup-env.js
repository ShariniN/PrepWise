// Loaded before every test file (see the "test" script in package.json).
// Point dotenv at a file that does not exist so tests never read server/.env:
// no real API keys, no paid calls, no real database.
process.env.DOTENV_CONFIG_PATH = new URL('./no-such.env', import.meta.url).pathname;
for (const key of [
  'MONGODB_URI', 'GEMINI_API_KEY', 'HF_API_TOKEN', 'GROQ_API_KEY',
  'EXECUTION_PROVIDER', 'JUDGE0_URL', 'JUDGE0_API_KEY', 'JUDGE0_API_HOST',
  'JDOODLE_CLIENT_ID', 'JDOODLE_CLIENT_SECRET', 'SMTP_USER', 'SMTP_PASS',
]) delete process.env[key];
// The signup mail limit counts per process, and one test file signs up more than the default 30 times.
process.env.SIGNUP_MAIL_LIMIT = '1000';
