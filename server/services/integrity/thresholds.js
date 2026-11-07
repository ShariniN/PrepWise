// Per-assessment thresholds for the reasons the flagging module can produce. A lecturer can tune each one.
export const DEFAULT_THRESHOLDS = {
  leftPageCount: 5,           // times the tab was hidden
  leftPageTotalSeconds: 180,  // total time the tab was hidden
  fullscreenExits: 3,
  pasteChars: 500,            // characters in a single paste
  clipboardOutCount: 15,      // copy + cut events
  typingBurstCpm: 700,        // characters per minute in a one-minute window (human sustained typing is rarely above ~400)
  typingJumpRatio: 4,         // window speed relative to the median of the other active windows
  typingJumpMinCpm: 300,      // ... and at least this fast
  hintSignalCount: 1,         // devtools / multiple-screen hints (low confidence)
  similarityContainment: 0.7, // cohort similarity: share of the smaller submission that matches
};

const RANGES = {
  leftPageCount: [1, 1000], leftPageTotalSeconds: [10, 36000], fullscreenExits: [1, 1000], pasteChars: [20, 100000],
  clipboardOutCount: [1, 10000], typingBurstCpm: [100, 5000], typingJumpRatio: [1.5, 50], typingJumpMinCpm: [50, 5000],
  hintSignalCount: [1, 1000], similarityContainment: [0.3, 1],
};

// Returns { clean } or { error }. Unknown keys are rejected so a typo cannot silently do nothing.
export const sanitizeThresholds = (input) => {
  if (input === undefined) return { clean: undefined };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'flagThresholds must be an object' };
  const clean = {};
  for (const [k, v] of Object.entries(input)) {
    if (!RANGES[k]) return { error: `Unknown threshold: ${k}` };
    const [lo, hi] = RANGES[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return { error: `${k} must be a number between ${lo} and ${hi}` };
    clean[k] = v;
  }
  return { clean };
};

export const effectiveThresholds = (assessment) => ({ ...DEFAULT_THRESHOLDS, ...(assessment?.flagThresholds || {}) });
