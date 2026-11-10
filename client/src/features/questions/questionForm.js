import { isCodeType } from '../../utils/practice';

export const blankForm = () => ({
  title: '', statement: '', type: 'coding', topic: '', difficulty: 'easy',
  languages: ['python'], starterCode: {}, timeLimitMs: 2000, memoryLimitKb: 256000,
  estimatedMinutes: '', learningOutcome: '',
  referenceSolution: { language: 'python', source: '' },
  wrongSolution: { language: 'python', source: '' },
  options: ['', ''], correct: [], multi: false, traceAnswer: '', explanation: '',
});

// Staff question view -> editable form state.
export const toForm = (q) => ({
  ...blankForm(),
  title: q.title || '',
  statement: q.statement || '',
  type: q.type,
  topic: (q.topic || []).join(', '),
  difficulty: q.difficulty || 'easy',
  languages: q.languages || [],
  starterCode: q.starterCode || {},
  timeLimitMs: q.timeLimitMs ?? 2000,
  memoryLimitKb: q.memoryLimitKb ?? 256000,
  estimatedMinutes: q.estimatedMinutes ?? '',
  learningOutcome: q.learningOutcome || '',
  referenceSolution: q.referenceSolution?.source
    ? { language: q.referenceSolution.language, source: q.referenceSolution.source }
    : { language: q.languages?.[0] || 'python', source: '' },
  wrongSolution: q.wrongSolution?.source
    ? { language: q.wrongSolution.language, source: q.wrongSolution.source }
    : { language: q.languages?.[0] || 'python', source: '' },
  options: q.options?.length ? q.options : ['', ''],
  correct: q.correct || [],
  multi: !!q.multi,
  traceAnswer: q.traceAnswer || '',
  explanation: q.explanation || '',
});

// Form state -> request body. `hadWrong` tells us to send null to clear a stored wrong solution.
export const toPayload = (f, { isNew, hadWrong }) => {
  const body = {
    title: f.title.trim(),
    statement: f.statement,
    topic: f.topic.split(',').map((t) => t.trim()).filter(Boolean),
    difficulty: f.difficulty,
    learningOutcome: f.learningOutcome,
    explanation: f.explanation,
  };
  if (f.estimatedMinutes !== '') body.estimatedMinutes = Number(f.estimatedMinutes);
  if (isNew) body.type = f.type;
  if (isCodeType(f.type)) {
    body.languages = f.languages;
    body.starterCode = Object.fromEntries(Object.entries(f.starterCode).filter(([l, s]) => f.languages.includes(l) && s));
    body.timeLimitMs = Number(f.timeLimitMs);
    body.memoryLimitKb = Number(f.memoryLimitKb);
    if (f.referenceSolution.source.trim()) body.referenceSolution = f.referenceSolution;
    if (f.wrongSolution.source.trim()) body.wrongSolution = f.wrongSolution;
    else if (hadWrong) body.wrongSolution = null;
  }
  if (f.type === 'mcq') {
    body.options = f.options.map((o) => o.trim()).filter(Boolean);
    body.correct = f.correct;
    body.multi = f.multi;
  }
  if (f.type === 'trace') body.traceAnswer = f.traceAnswer;
  return body;
};

// Why publishing is blocked right now (empty list = ready). Mirrors the server rules;
// the server remains the authority and may still answer PUBLISH_BLOCKED.
export const publishBlockers = (q, dirty) => {
  const out = [];
  if (dirty) out.push('Save your changes first.');
  if (isCodeType(q.type)) {
    const tests = q.tests || [];
    if (tests.length === 0) out.push('Add at least one test case.');
    else if (!tests.some((t) => t.visible)) out.push('At least one test must be visible to students.');
    if (!q.referenceSolution?.source) out.push('Add a reference solution.');
    if (q.source === 'ai_drafted' && !q.wrongSolution?.source) out.push('AI drafts need a wrong solution.');
    const v = q.validation;
    if (!v) out.push('Run "Validate in sandbox".');
    else if (!v.current) out.push('The question changed since it was last validated. Validate again.');
    else if (!v.passed) out.push('The last validation failed. Fix the question and validate again.');
  } else if (q.type === 'mcq') {
    if ((q.options || []).length < 2) out.push('Add at least two options.');
    if (!(q.correct || []).length) out.push('Mark the correct option(s).');
  } else if (q.type === 'trace' && !q.traceAnswer) {
    out.push('Enter the expected trace output.');
  }
  return out;
};
