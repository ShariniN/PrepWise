// CV-to-job match scoring. Pure functions plus one injectable AI call, so it can be tested without Gemini.
//
// The score shown to students is: 70% the AI's judgement of evidence-backed fit + 30% the share of the
// job's required skills that the CV names. Both parts are returned so the UI can explain the number.
// If the AI call fails we say so and do not show a blended percentage; we never present a fallback as AI output.

export const SKILL_GROUPS = {
  languages: ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'c', 'golang', 'rust', 'swift', 'kotlin', 'scala', 'ruby', 'php', 'matlab'],
  web: ['react', 'angular', 'vue', 'node.js', 'nodejs', 'express', 'django', 'flask', 'spring', 'html', 'css', 'tailwind', 'next.js'],
  fundamentals: ['data structures', 'algorithms', 'recursion', 'dynamic programming', 'big o', 'object oriented', 'oop'],
  tools: ['git', 'github', 'docker', 'kubernetes', 'ci/cd', 'unit testing', 'unit tests', 'unit test', 'testing', 'tests', 'tested', 'jest', 'mocha', 'pytest', 'junit', 'agile', 'scrum', 'rest', 'api', 'graphql', 'linux'],
  databases: ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'firebase', 'nosql'],
};

// The same skill written differently counts once.
const ALIASES = {
  nodejs: 'node.js', apis: 'api', 'rest api': 'rest', 'rest apis': 'rest',
  'unit tests': 'unit testing', 'unit test': 'unit testing',
  tests: 'testing', tested: 'testing', jest: 'testing', mocha: 'testing', pytest: 'testing', junit: 'testing',
};
const ALL_SKILLS = [...new Set(Object.values(SKILL_GROUPS).flat())];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A skill must stand alone: no letter, digit, "+" or "#" directly before or after it.
// So "c" does not match inside "creative", "java" does not match "javascript", and "c++" is not read as "c".
const termRegex = (skill) => new RegExp(`(?<![a-z0-9+#])${escape(skill)}(?![a-z0-9+#])`, 'i');
const REGEXES = new Map(ALL_SKILLS.map((s) => [s, termRegex(s)]));

export const findSkills = (text) => {
  const lower = String(text || '').toLowerCase();
  const found = ALL_SKILLS.filter((s) => REGEXES.get(s).test(lower)).map((s) => ALIASES[s] || s);
  if (found.includes('unit testing')) found.push('testing');
  return [...new Set(found)];
};

// One skill of a target role, written the way admins write them: "JavaScript or Python", "HTML and CSS",
// "SQL basics". It is in the CV when one "or" option is, and an option is when every "and" part is.
// A part may be singular or plural, and a trailing "basics" is ignored.
const partRegex = (part) => {
  const words = part.trim().toLowerCase().replace(/\s+basics?$/, '');
  const stem = /[a-z]{3}s$/.test(words) ? words.slice(0, -1) : words;
  return new RegExp(`(?<![a-z0-9+#])${escape(stem)}(?:s|es)?(?![a-z0-9+#])`, 'i');
};
const roleSkillIn = (text, skill) => skill.split(/\s+or\s+|\s*\/\s*/i).some((option) =>
  option.split(/\s+and\s+|\s*&\s*|\s*,\s*/i).filter((p) => p.trim()).every((p) => partRegex(p).test(text)));

const cleanSkills = (skills) => [...new Set((skills || []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))];

// With requiredSkills (a target role's own list), those are the required skills, in the role's spelling.
// Without them, or with an empty list, the required skills are the fixed technical terms found in the job text.
export const keywordMatch = (resumeText, jobDesc, requiredSkills = null) => {
  const roleSkills = cleanSkills(requiredSkills);
  if (roleSkills.length) {
    const text = String(resumeText || '');
    const matched = roleSkills.filter((s) => roleSkillIn(text, s));
    const missing = roleSkills.filter((s) => !matched.includes(s));
    return { score: matched.length / roleSkills.length, required: roleSkills, matched, missing };
  }
  const required = findSkills(jobDesc);
  const have = new Set(findSkills(resumeText));
  const matched = required.filter((s) => have.has(s));
  const missing = required.filter((s) => !have.has(s));
  return { score: required.length ? matched.length / required.length : 0, required, matched, missing };
};

// Accept only a bare number: 0-1, or 0-100 (treated as a percentage). Anything else is "no score".
export const parseScore = (raw) => {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,3}(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (n >= 0 && n <= 1) return n;
  if (n > 1 && n <= 100 && Number.isInteger(n)) return n / 100;
  return null;
};

export const buildPrompt = (resumeText, jobDesc) => {
  const cut = (s) => (s.length > 4000 ? `${s.slice(0, 4000)}...` : s);
  return `You are an experienced recruiter assessing a student's CV against the internship described below.

Score how well the CV fits the job, based on EVIDENCE in the CV, from 0.0 to 1.0.

Rules:
- Credit a skill only when the CV shows it being used (a project, a job, coursework with detail).
  A bare list of keywords with no supporting work earns little credit.
- Penalise vague or empty content ("did some stuff", unfinished projects with no detail), missing
  education details, spelling and grammar problems, and missing contact details.
- Reward specific, measurable outcomes, relevant projects and experience, and clear structure.

Guide: 0.0-0.2 no relevant evidence; 0.2-0.4 weak, mostly claims; 0.4-0.6 some evidence, clear gaps;
0.6-0.8 good evidence, minor gaps; 0.8-1.0 excellent, specific evidence for most requirements.

CV:
${cut(resumeText)}

Job description:
${cut(jobDesc)}

Reply with ONLY the number, for example 0.42.`;
};

export const AI_WEIGHT = 0.7;

export const scoreResume = async ({ resumeText, jobDesc, generate, requiredSkills = null }) => {
  const kw = keywordMatch(resumeText, jobDesc, requiredSkills);
  const base = {
    keywordScore: Number(kw.score.toFixed(3)),
    requiredSkills: kw.required,
    matchedSkills: kw.matched,
    missingSkills: kw.missing,
  };
  // `generate` returns either the reply text or { text, model } (model = which AI model answered).
  let raw;
  let model = null;
  try {
    const out = await generate(buildPrompt(resumeText, jobDesc));
    raw = typeof out === 'string' ? out : out?.text;
    model = typeof out === 'string' ? null : out?.model ?? null;
  } catch (err) {
    return { ...base, aiAvailable: false, aiScore: null, aiError: String(err?.message || err), model, matchPercentage: null };
  }
  const aiScore = parseScore(raw);
  if (aiScore === null) {
    return { ...base, aiAvailable: false, aiScore: null, aiError: `Unreadable AI reply: ${String(raw).slice(0, 80)}`, model, matchPercentage: null };
  }
  const blended = aiScore * AI_WEIGHT + kw.score * (1 - AI_WEIGHT);
  return { ...base, aiAvailable: true, aiScore, aiError: null, model, matchPercentage: Math.round(blended * 100) };
};
