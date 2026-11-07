export const QUESTION_TYPES = ['coding', 'debug', 'mcq', 'trace', 'short', 'behavioural'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const isCodeType = (t) => t === 'coding' || t === 'debug';
export const STATUSES = ['draft', 'in_review', 'published', 'retired'];

export const EDITOR_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'php', label: 'PHP' },
];
