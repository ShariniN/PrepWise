export const VERDICTS = ['accepted', 'wrong_answer', 'time_limit', 'memory_limit', 'compile_error', 'runtime_error', 'unavailable'];

// Judge0 status ids -> verdicts. 1 and 2 (queued, processing) are not final and never reach this map.
// "accepted" at provider level means "ran to completion"; comparing output with the expected output is the grader's job.
export const mapJudge0Status = (id, { memoryKb, memoryLimitKb } = {}) => {
  if (id === 3) return 'accepted';
  if (id === 4) return 'wrong_answer';
  if (id === 5) return 'time_limit';
  if (id === 6) return 'compile_error';
  if (id >= 7 && id <= 12) {
    // Judge0 has no memory-limit status: an allocation failure shows up as a signal or a non-zero exit
    if (memoryLimitKb && memoryKb && memoryKb >= memoryLimitKb) return 'memory_limit';
    return 'runtime_error';
  }
  if (id === 14) return 'runtime_error'; // exec format error
  return 'unavailable'; // 13 internal error, or anything unknown: never guess a verdict
};

export const isFinalJudge0Status = (id) => id > 2;
