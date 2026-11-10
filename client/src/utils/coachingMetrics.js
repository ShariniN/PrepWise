// Delivery coaching maths. Pure functions only: no React, no DOM, no browser globals,
// so the server's node:test suite can import this file directly (server/tests/coaching-metrics.test.js).
//
// Everything here works on numbers measured in the browser. No video or image ever leaves the device;
// only the summary returned by buildDeliveryMetrics() is sent with an answer.

/** Head turned less than this (degrees, yaw and pitch) counts as "facing the camera". */
export const FACING_LIMIT_DEG = 15;
/** A look-away has to last at least this long before it is counted (or hinted live). */
export const LOOK_AWAY_MIN_MS = 1500;
/** Samples further apart than this are treated as a pause in sampling, not one long stretch. */
export const MAX_SAMPLE_GAP_MS = 1000;
/** Combined yaw/pitch standard deviation (degrees) at which head movement becomes medium / high. */
export const HEAD_MOVEMENT_MEDIUM_DEG = 5;
export const HEAD_MOVEMENT_HIGH_DEG = 10;
/** Head movement needs at least this many face samples (about 1 second at 5 fps). */
export const MIN_FACE_SAMPLES_FOR_MOVEMENT = 5;
/** Friendly speaking-pace range, words per minute. */
export const PACE_TARGET = { min: 120, max: 160 };

const RAD_TO_DEG = 180 / Math.PI;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/**
 * Head orientation from MediaPipe's facial transformation matrix (4x4, flattened, column-major,
 * which is MediaPipe's MatrixData default). Returns degrees, or null when the input is not a 4x4.
 *
 * The rotation is decomposed as R = Ry(yaw) * Rx(pitch) * Rz(roll):
 *   yaw   = atan2(R[0][2], R[2][2])  (turning left/right)
 *   pitch = asin(-R[1][2])           (nodding up/down)
 *   roll  = atan2(R[1][0], R[1][1])  (tilting the head sideways)
 * A face looking straight into the camera gives R close to identity, so yaw = pitch = roll = 0.
 *
 * Mirroring: the model always analyses the raw camera frames. The self-view is mirrored with CSS only,
 * so the sign of yaw never depends on how the preview is drawn. The metrics only use |yaw| and |pitch|.
 */
export function headPoseFromMatrix(data) {
  if (!data || data.length !== 16) return null;
  const m = (row, col) => data[col * 4 + row];
  const r02 = m(0, 2);
  const r22 = m(2, 2);
  const r12 = m(1, 2);
  const r10 = m(1, 0);
  const r11 = m(1, 1);
  if (![r02, r22, r12, r10, r11].every(isNum)) return null;
  const yaw = Math.atan2(r02, r22) * RAD_TO_DEG;
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r12))) * RAD_TO_DEG;
  const roll = Math.atan2(r10, r11) * RAD_TO_DEG;
  return { yaw, pitch, roll };
}

/** True when the head is turned less than FACING_LIMIT_DEG in both yaw and pitch. */
export function isFacingCamera(yaw, pitch, limit = FACING_LIMIT_DEG) {
  return isNum(yaw) && isNum(pitch) && Math.abs(yaw) < limit && Math.abs(pitch) < limit;
}

/**
 * Supporting signal only: do the eye blendshapes say the eyes are pointed well away from the camera,
 * even though the head faces it? `categories` is MediaPipe's faceBlendshapes[0].categories
 * ([{ categoryName, score }]). Returns null when blendshapes are missing.
 * Not used for eyeContactPct (which is head-orientation based); only used to make the live hint
 * a little more responsive.
 */
export function eyesLookingAway(categories, threshold = 0.6) {
  if (!Array.isArray(categories) || categories.length === 0) return null;
  const score = (name) => categories.find((c) => c?.categoryName === name)?.score ?? 0;
  const both = (a, b) => Math.min(score(a), score(b));
  // Both eyes turned the same way (left eye out + right eye in, etc.) by a large amount.
  const sideways = Math.max(both('eyeLookOutLeft', 'eyeLookInRight'), both('eyeLookInLeft', 'eyeLookOutRight'));
  const vertical = Math.max(both('eyeLookUpLeft', 'eyeLookUpRight'), both('eyeLookDownLeft', 'eyeLookDownRight'));
  return Math.max(sideways, vertical) >= threshold;
}

/**
 * Turn one MediaPipe FaceLandmarker result into a sample. `t` is a millisecond timestamp.
 * Sample shape: { t, face: boolean, yaw: number|null, pitch: number|null, eyesAway: boolean|null }
 */
export function sampleFromResult(result, t) {
  const hasFace = Array.isArray(result?.faceLandmarks) && result.faceLandmarks.length > 0;
  if (!hasFace) return { t, face: false, yaw: null, pitch: null, eyesAway: null };
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  const pose = headPoseFromMatrix(matrix ? Array.from(matrix) : null);
  return {
    t,
    face: true,
    yaw: pose ? pose.yaw : null,
    pitch: pose ? pose.pitch : null,
    eyesAway: eyesLookingAway(result.faceBlendshapes?.[0]?.categories),
  };
}

const sampleFacing = (s) => s.face && isFacingCamera(s.yaw, s.pitch);
// "Away" means a face is detected and the head is turned away from the camera.
const sampleAway = (s) => s.face && isNum(s.yaw) && isNum(s.pitch) && !isFacingCamera(s.yaw, s.pitch);

function typicalInterval(samples) {
  const gaps = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > 0 && dt <= MAX_SAMPLE_GAP_MS) gaps.push(dt);
  }
  if (gaps.length === 0) return 200;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Count look-aways that lasted at least LOOK_AWAY_MIN_MS.
 * - An episode starts at a sample where a face is seen with the head turned away.
 * - Samples with no face extend an episode that has already started (the head may be turned too far
 *   for the model to find it) but never start one: someone who is simply not in the frame is reported
 *   through faceVisiblePct instead.
 * - The episode ends at the next sample facing the camera, or at a gap in sampling.
 * Durations use timestamps, so dropped frames do not shorten or lengthen a look-away.
 */
export function countLookAways(samples, minMs = LOOK_AWAY_MIN_MS) {
  const list = (samples || []).filter((s) => s && isNum(s.t)).sort((a, b) => a.t - b.t);
  const step = typicalInterval(list);
  let count = 0;
  let start = null;
  let last = null;
  const close = (end) => {
    if (start !== null && end - start >= minMs) count++;
    start = null;
  };
  for (const s of list) {
    if (start !== null && last !== null && s.t - last.t > MAX_SAMPLE_GAP_MS) close(last.t + step);
    if (sampleAway(s)) {
      if (start === null) start = s.t;
    } else if (sampleFacing(s)) {
      close(s.t);
    }
    // no-face samples: keep the current episode (if any) open
    last = s;
  }
  if (last) close(last.t + step);
  return count;
}

const stdDev = (values) => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
};

/** low / medium / high from the spread of yaw and pitch. null when there is too little face data. */
export function headMovementLevel(samples) {
  const face = (samples || []).filter((s) => s?.face && isNum(s.yaw) && isNum(s.pitch));
  if (face.length < MIN_FACE_SAMPLES_FOR_MOVEMENT) return null;
  const spread = Math.sqrt(stdDev(face.map((s) => s.yaw)) ** 2 + stdDev(face.map((s) => s.pitch)) ** 2);
  if (spread < HEAD_MOVEMENT_MEDIUM_DEG) return 'low';
  if (spread < HEAD_MOVEMENT_HIGH_DEG) return 'medium';
  return 'high';
}

/**
 * Summarise the samples of one answer.
 * - faceVisiblePct: % of samples with a face (null with no samples).
 * - eyeContactPct: % of face samples with |yaw| < 15 and |pitch| < 15. This is head orientation
 *   ("facing the camera"), not true gaze tracking. null when no face was ever seen.
 * - lookAwayCount: see countLookAways (null when no face was ever seen).
 * - headMovement: see headMovementLevel.
 */
export function summariseFaceSamples(samples) {
  const list = (samples || []).filter((s) => s && isNum(s.t));
  if (list.length === 0) {
    return { faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null };
  }
  const face = list.filter((s) => s.face);
  const posed = face.filter((s) => isNum(s.yaw) && isNum(s.pitch));
  return {
    faceVisiblePct: round((face.length / list.length) * 100),
    eyeContactPct: posed.length ? round((posed.filter(sampleFacing).length / posed.length) * 100) : null,
    lookAwayCount: posed.length ? countLookAways(list) : null,
    headMovement: headMovementLevel(list),
  };
}

/**
 * What the live hint should say right now, from the most recent samples. Returns
 * 'no-face' | 'look-at-camera' | null. The hint is deliberately not directional ("look left"),
 * so mirroring the preview can never make it point the wrong way.
 */
export function liveHint(samples, now, { awayMs = LOOK_AWAY_MIN_MS, noFaceMs = 2000 } = {}) {
  const list = (samples || []).filter((s) => s && isNum(s.t) && s.t <= now);
  if (list.length === 0) return null;
  const lastSample = list[list.length - 1];
  if (now - lastSample.t > MAX_SAMPLE_GAP_MS) return null;
  // How long has the current condition held, walking back from the newest sample?
  const heldFor = (pred) => {
    let since = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!pred(list[i])) break;
      since = list[i].t;
    }
    return since === null ? 0 : now - since;
  };
  if (heldFor((s) => !s.face) >= noFaceMs) return 'no-face';
  if (heldFor((s) => s.face && (sampleAway(s) || s.eyesAway === true)) >= awayMs) return 'look-at-camera';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Speech metrics (from the transcript and the recording length)
// ---------------------------------------------------------------------------------------------

/** Below this many seconds the pace is too noisy to report. */
export const MIN_SECONDS_FOR_PACE = 5;

export function countWords(text) {
  if (typeof text !== 'string') return 0;
  // A word may contain ' - and an inner dot ("Node.js", "3.5"), so names and numbers count once.
  const words = text.trim().match(/[\p{L}\p{N}](?:[\p{L}\p{N}'’-]|\.(?=[\p{L}\p{N}]))*/gu);
  return words ? words.length : 0;
}

/** Words per minute, rounded. null without a usable duration or transcript. */
export function wordsPerMinute(text, durationSec) {
  if (!isNum(durationSec) || durationSec < MIN_SECONDS_FOR_PACE) return null;
  const words = countWords(text);
  if (words === 0) return null;
  return round(words / (durationSec / 60));
}

const AUX_BEFORE_YOU_KNOW = new Set([
  'do', 'did', 'does', "don't", 'dont', "didn't", 'didnt', 'if', 'would', 'could', 'can', 'will',
  'should', 'as', 'may', 'might', 'what', 'how', 'when', 'where', 'why', 'who', 'whether', 'that',
]);
// "like" after these words is the verb or a comparison, not a filler ("I like, ...", "looks like, ...").
const LIKE_AS_VERB_BEFORE = new Set([
  'i', 'you', 'we', 'they', 'he', 'she', 'would', "i'd", "we'd", "you'd", 'really', 'also', 'do', 'did',
  "don't", 'dont', "didn't", 'didnt', 'to', 'looks', 'look', 'looked', 'something', 'feel', 'feels',
  'felt', 'seem', 'seems', 'things', 'people', 'what',
]);

/**
 * Count filler words. Returns { total, byWord: { um: 2, 'you know': 1, ... } }.
 * Rules (chosen to under-count rather than over-count):
 * - um, umm, uh, uhh, uhm, er, erm, hmm: every occurrence.
 * - "like": only when it is set off by a comma ("it was, like, fine" / "like, I think"), never
 *   "I like Java" or "looks like". Transcripts without punctuation will under-count this.
 * - "you know": unless it is part of a question or clause ("do you know", "if you know", "as you know").
 * - "basically", "actually": every occurrence (these are sometimes meaningful; small over-count).
 * - "so": only at the start of a sentence ("So, I started by...").
 */
export function countFillerWords(text) {
  const byWord = {};
  if (typeof text !== 'string' || !text.trim()) return { total: 0, byWord };
  const add = (w, n = 1) => {
    if (n > 0) byWord[w] = (byWord[w] || 0) + n;
  };
  const lower = text.toLowerCase().replace(/’/g, "'");

  const simple = [
    ['um', /\b(?:um+|uhm+)\b/g],
    ['uh', /\buh+\b/g],
    ['er', /\b(?:er+|erm+)\b/g],
    ['hmm', /\bhm+\b/g],
    ['basically', /\bbasically\b/g],
    ['actually', /\bactually\b/g],
  ];
  for (const [name, re] of simple) add(name, (lower.match(re) || []).length);

  // "like" directly followed by a comma, unless the word before makes it a verb ("I like, ...").
  let m;
  const likeRe = /(?:\b([a-z']+)\s+)?\blike\s*,/g;
  while ((m = likeRe.exec(lower)) !== null) {
    if (!m[1] || !LIKE_AS_VERB_BEFORE.has(m[1])) add('like');
  }

  // "you know" not preceded by an auxiliary / question word.
  const ykRe = /(?:\b([a-z']+)\s+)?\byou know\b/g;
  while ((m = ykRe.exec(lower)) !== null) {
    if (!m[1] || !AUX_BEFORE_YOU_KNOW.has(m[1])) add('you know');
  }

  // Sentence-initial "so".
  add('so', (lower.match(/(?:^|[.!?]\s+)so\b/g) || []).length);

  const total = Object.values(byWord).reduce((a, b) => a + b, 0);
  return { total, byWord };
}

/**
 * Speech metrics for one answer. Only spoken (audio) answers with a real transcript get numbers;
 * typed answers, code answers and hand-typed transcripts return nulls.
 */
export function speechMetrics({ spoken, transcript, durationSec }) {
  if (!spoken || typeof transcript !== 'string' || !transcript.trim()) {
    return { wordsPerMinute: null, fillerWordCount: null, durationSec: null };
  }
  const duration = isNum(durationSec) && durationSec > 0 ? round(durationSec, 1) : null;
  return {
    wordsPerMinute: wordsPerMinute(transcript, duration),
    fillerWordCount: countFillerWords(transcript).total,
    durationSec: duration,
  };
}

/**
 * The exact object sent as `deliveryMetrics` with a submit-answer request.
 * cameraUsed is true only when at least one camera sample was taken for this answer.
 */
export function buildDeliveryMetrics({ samples, spoken, transcript, durationSec }) {
  const cameraUsed = Array.isArray(samples) && samples.length > 0;
  const face = cameraUsed
    ? summariseFaceSamples(samples)
    : { faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null };
  const speech = speechMetrics({ spoken, transcript, durationSec });
  return {
    cameraUsed,
    faceVisiblePct: face.faceVisiblePct,
    eyeContactPct: face.eyeContactPct,
    lookAwayCount: face.lookAwayCount,
    headMovement: face.headMovement,
    wordsPerMinute: speech.wordsPerMinute,
    fillerWordCount: speech.fillerWordCount,
    durationSec: speech.durationSec,
  };
}

// ---------------------------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------------------------

const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Summary across answers for the final report. Every field is null when nothing was measured. */
export function summariseDelivery(metricsList) {
  const list = (metricsList || []).filter((m) => m && typeof m === 'object');
  const cam = list.filter((m) => m.cameraUsed);
  const nums = (key, from = list) => from.map((m) => m[key]).filter(isNum);
  const face = nums('faceVisiblePct', cam);
  const eye = nums('eyeContactPct', cam);
  const looks = nums('lookAwayCount', cam);
  const wpm = nums('wordsPerMinute');
  const fillers = nums('fillerWordCount');
  const levels = cam.map((m) => m.headMovement).filter((v) => v === 'low' || v === 'medium' || v === 'high');
  const order = ['low', 'medium', 'high'];
  // Most common level; ties go to the calmer level.
  let headMovement = null;
  if (levels.length) {
    const counts = order.map((l) => levels.filter((v) => v === l).length);
    headMovement = order[counts.indexOf(Math.max(...counts))];
  }
  return {
    answers: list.length,
    answersWithCamera: cam.length,
    answersWithSpeech: wpm.length,
    faceVisiblePct: face.length ? round(avg(face)) : null,
    eyeContactPct: eye.length ? round(avg(eye)) : null,
    lookAwayCount: looks.length ? looks.reduce((a, b) => a + b, 0) : null,
    headMovement,
    wordsPerMinute: wpm.length ? round(avg(wpm)) : null,
    fillerWordCount: fillers.length ? fillers.reduce((a, b) => a + b, 0) : null,
    fillersPerAnswer: fillers.length ? round(avg(fillers), 1) : null,
  };
}

/** Pace in plain words. */
export function paceLabel(wpm) {
  if (!isNum(wpm)) return null;
  if (wpm < PACE_TARGET.min) return 'slow';
  if (wpm > PACE_TARGET.max) return 'fast';
  return 'good';
}

/**
 * Plain-language, encouraging tips for one answer's metrics (or a summary from summariseDelivery).
 * Returns at most `max` short strings, most useful first.
 */
export function deliveryTips(m, { max = 3 } = {}) {
  if (!m || typeof m !== 'object') return [];
  const tips = [];
  const camera = m.cameraUsed === undefined ? (m.answersWithCamera ?? 0) > 0 : m.cameraUsed;
  if (camera) {
    if (isNum(m.faceVisiblePct) && m.faceVisiblePct < 50) {
      tips.push('We could not see your face for much of this. Sit facing the camera with light in front of you, not behind.');
    } else if (isNum(m.eyeContactPct) && m.eyeContactPct < 60) {
      tips.push('Try to look at the camera lens while you talk. It reads as eye contact to the interviewer.');
    }
    if (isNum(m.lookAwayCount) && m.lookAwayCount >= 3) {
      tips.push('You looked away a few times. A short pause while facing the camera is fine when you need to think.');
    }
    if (m.headMovement === 'high') {
      tips.push('Your head moved quite a lot. Sit back, plant your feet and keep your shoulders relaxed.');
    }
  }
  const pace = paceLabel(m.wordsPerMinute);
  if (pace === 'fast') tips.push(`You spoke at about ${m.wordsPerMinute} words a minute. Slow down a little (around ${PACE_TARGET.min}-${PACE_TARGET.max}) and pause between points.`);
  if (pace === 'slow') tips.push(`You spoke at about ${m.wordsPerMinute} words a minute. A bit more pace (around ${PACE_TARGET.min}-${PACE_TARGET.max}) keeps the listener engaged.`);
  const fillers = isNum(m.fillersPerAnswer) ? m.fillersPerAnswer : m.fillerWordCount;
  if (isNum(fillers) && fillers >= 5) {
    tips.push('Watch the filler words ("um", "like", "you know"). Replace them with a short silent pause.');
  }
  if (tips.length === 0 && (camera || pace)) {
    tips.push('Nice, steady delivery. Keep it up.');
  }
  return tips.slice(0, max);
}
