// One language table for every provider. Canonical names are what the rest of the app uses.
// Judge0 ids are for Judge0 CE 1.13.x; hosted services may use different ids, so JUDGE0_LANGUAGE_IDS
// (a JSON object such as {"python":92}) overrides them.
export const LANGUAGES = {
  javascript: { judge0: 63, jdoodle: { language: 'nodejs', versionIndex: '4' } },
  python: { judge0: 71, jdoodle: { language: 'python3', versionIndex: '4' } },
  java: { judge0: 62, jdoodle: { language: 'java', versionIndex: '4' } },
  cpp: { judge0: 54, jdoodle: { language: 'cpp17', versionIndex: '0' } },
  c: { judge0: 50, jdoodle: { language: 'c', versionIndex: '5' } },
  csharp: { judge0: 51, jdoodle: { language: 'csharp', versionIndex: '4' } },
  go: { judge0: 60, jdoodle: { language: 'go', versionIndex: '4' } },
  php: { judge0: 68, jdoodle: { language: 'php', versionIndex: '4' } },
  // SQL is deliberately absent: it needs a schema and a seeded database per question, which is not built yet.
};

const ALIASES = {
  js: 'javascript', node: 'javascript', nodejs: 'javascript', 'node.js': 'javascript',
  py: 'python', python3: 'python',
  'c++': 'cpp', cpp17: 'cpp',
  'c#': 'csharp', cs: 'csharp',
  golang: 'go',
};

export const normalizeLanguage = (name) => {
  const key = String(name || '').trim().toLowerCase();
  const canonical = ALIASES[key] || key;
  return Object.hasOwn(LANGUAGES, canonical) ? canonical : null;
};

export const supportedLanguages = () => Object.keys(LANGUAGES);

export const judge0IdFor = (language, env = process.env) => {
  try {
    const override = env.JUDGE0_LANGUAGE_IDS ? JSON.parse(env.JUDGE0_LANGUAGE_IDS) : null;
    if (override && Number.isInteger(override[language])) return override[language];
  } catch { /* a malformed override falls back to the defaults */ }
  return LANGUAGES[language]?.judge0;
};
