// The question pool of one adaptive interview: the 4 non-coding slots at three levels each (12 questions), written
// by ONE AI call and tailored to the CV and the target role. A slot the AI did not answer completely and correctly
// comes from the generic fallback pool, and usedFallbackQuestions says so. The pool stays on the server.
import { LEVELS, POOL_SLOTS, SLOT_TYPES } from './interviews.adaptive.js';
import { fallbackSlot, expectedDurationFor } from './interviews.questions.js';

const MIN_QUESTION = 10;
const MAX_QUESTION = 600;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const buildPoolPrompt = ({ resumeText, role, jobDescription }) => {
  const jd = clean(jobDescription);
  return `You are preparing a mock job interview for a university student.

TARGET ROLE: ${role.title}
ROLE DESCRIPTION: ${clean(role.description)}
KEY SKILLS: ${(role.skills || []).join(', ')}
${jd ? `\nSPECIFIC JOB DESCRIPTION (first 1500 characters):\n${jd.slice(0, 1500)}\n` : ''}
CANDIDATE'S CV (first 3000 characters):
${String(resumeText || '').slice(0, 3000)}

Write interview questions for four slots, each at three difficulty levels (easy, medium, hard):
- slot "0": behavioural
- slot "1": technical
- slot "3": technical, on a different topic from slot 1
- slot "4": behavioural, on a different theme from slot 0
Refer to the CV and the role where you can. Easy suits a beginner, hard suits a strong final-year student.
Each question is one or two sentences and is answered by speaking or typing, not by writing code.

Return ONLY this JSON, with no other text:
{"slots":{"0":{"easy":{"question":"...","category":"..."},"medium":{"question":"...","category":"..."},"hard":{"question":"...","category":"..."}},"1":{...},"3":{...},"4":{...}}}`;
};

// The first {...} block of the reply, or null.
const parseObject = (text) => {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
};

// The slot's three questions, or null when any level is missing or unusable.
const readSlot = (raw, slot) => {
  if (!raw || typeof raw !== 'object') return null;
  const type = SLOT_TYPES[slot];
  const out = {};
  for (const level of LEVELS) {
    const question = clean(raw[level]?.question);
    if (question.length < MIN_QUESTION || question.length > MAX_QUESTION) return null;
    const category = clean(raw[level]?.category).slice(0, 60) || type;
    out[level] = { questionId: `s${slot}-${level}`, type, question, category, expectedDuration: expectedDurationFor(type) };
  }
  return out;
};

// `generate(prompt)` returns the reply text or { text, model }. It is called exactly once.
export const buildPool = async ({ resumeText, role, jobDescription, generate }) => {
  let parsed = null;
  try {
    const out = await generate(buildPoolPrompt({ resumeText, role, jobDescription }));
    parsed = parseObject(typeof out === 'string' ? out : out?.text);
  } catch (error) {
    console.error('Interview question pool: AI unavailable, using the generic questions:', error.message);
  }
  const slots = parsed?.slots && typeof parsed.slots === 'object' ? parsed.slots : parsed;
  const pool = {};
  let usedFallbackQuestions = false;
  for (const slot of POOL_SLOTS) {
    const fromAi = readSlot(slots?.[slot], slot);
    pool[slot] = fromAi || fallbackSlot(slot);
    if (!fromAi) usedFallbackQuestions = true;
  }
  return { pool, usedFallbackQuestions };
};
