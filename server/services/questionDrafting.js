// Turns the AI's raw draft output into validated draft objects. The AI call goes through aiService, so the
// per-university monthly cap applies. Nothing here is trusted: every draft still has to pass the sandbox gate.
import aiService from './aiService.js';

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export const normalizeDraft = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 200).trim();
  const statement = text(raw.statement, 20000).trim();
  const referenceSolution = text(raw.referenceSolution, 65536);
  const wrongSolution = text(raw.wrongSolution, 65536);
  const tests = (Array.isArray(raw.tests) ? raw.tests : [])
    .filter((t) => t && typeof t.expectedOutput !== 'undefined')
    .slice(0, 12)
    .map((t) => ({ input: text(String(t.input ?? ''), 16384), expectedOutput: text(String(t.expectedOutput), 16384), visible: !!t.visible }));
  if (!title || !statement || !referenceSolution.trim() || !wrongSolution.trim() || tests.length < 2) return null;
  if (!tests.some((t) => t.visible)) tests[0].visible = true; // students need at least one example
  return { title, statement, starterCode: text(raw.starterCode, 65536), referenceSolution, wrongSolution, tests };
};

export const draftQuestions = async ({ topic, difficulty, language, count }) => {
  const raw = await aiService.generateQuestionDrafts({ topic, difficulty, language, count });
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.questions) ? raw.questions : []);
  return list.map(normalizeDraft).filter(Boolean).slice(0, count);
};
