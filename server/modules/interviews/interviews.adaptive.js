// Rules of the adaptive mock interview: 5 slots in a fixed mixed order, three levels, and one step up or down
// after each answer.
export const LEVELS = ['easy', 'medium', 'hard'];
export const SLOT_TYPES = ['behavioral', 'technical', 'coding', 'technical', 'behavioral'];
export const TOTAL_SLOTS = SLOT_TYPES.length;
export const CODING_SLOT = SLOT_TYPES.indexOf('coding');
export const POOL_SLOTS = SLOT_TYPES.map((t, i) => i).filter((i) => i !== CODING_SLOT);

// "How ready do you feel?" on a first interview.
export const READINESS_LEVEL = { just_starting: 'easy', some_practice: 'medium', ready: 'hard' };

export const STEP_UP_AT = 75;
export const STEP_DOWN_BELOW = 45;

// A null score (no real score, e.g. the AI was unavailable) keeps the level.
export const nextLevel = (level, score) => {
  const i = LEVELS.indexOf(level);
  if (i === -1) return LEVELS[0];
  if (typeof score !== 'number' || !Number.isFinite(score)) return level;
  if (score >= STEP_UP_AT) return LEVELS[Math.min(i + 1, LEVELS.length - 1)];
  if (score < STEP_DOWN_BELOW) return LEVELS[Math.max(i - 1, 0)];
  return level;
};

// The level the previous interview finished on, else the readiness answer; null when neither is known.
export const startLevelFor = ({ previousLevelReached, readiness } = {}) => {
  if (LEVELS.includes(previousLevelReached)) return previousLevelReached;
  return READINESS_LEVEL[readiness] || null;
};

// The score that moves the level: a skipped answer counts as 0, an answer scored by the basic fallback has none.
export const adaptiveScore = (response) => {
  if (response?.skipped) return 0;
  if (!response?.feedback || response.feedback.source === 'fallback') return null;
  return typeof response.feedback.score === 'number' ? response.feedback.score : null;
};

// Levels to try for a question, nearest first; on a tie the easier level comes first.
export const levelsByNearness = (level) => {
  const i = Math.max(0, LEVELS.indexOf(level));
  return [...LEVELS].sort((a, b) => Math.abs(LEVELS.indexOf(a) - i) - Math.abs(LEVELS.indexOf(b) - i) || LEVELS.indexOf(a) - LEVELS.indexOf(b));
};
