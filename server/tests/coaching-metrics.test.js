// Delivery coaching maths (client/src/utils/coachingMetrics.js). The module is pure ESM with no
// browser dependencies, so it is tested here with node:test. No camera, no model, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  headPoseFromMatrix, isFacingCamera, eyesLookingAway, sampleFromResult, countLookAways,
  headMovementLevel, summariseFaceSamples, liveHint, countWords, wordsPerMinute, countFillerWords,
  speechMetrics, buildDeliveryMetrics, summariseDelivery, paceLabel, deliveryTips,
} from '../../client/src/utils/coachingMetrics.js';

const DEG = Math.PI / 180;

// Row-major 3x3 multiply, then flatten a 4x4 in COLUMN-MAJOR order like MediaPipe's MatrixData.
const mul = (a, b) => a.map((row, i) => b[0].map((_, j) => row.reduce((s, _v, k) => s + a[i][k] * b[k][j], 0)));
const Ry = (d) => [[Math.cos(d * DEG), 0, Math.sin(d * DEG)], [0, 1, 0], [-Math.sin(d * DEG), 0, Math.cos(d * DEG)]];
const Rx = (d) => [[1, 0, 0], [0, Math.cos(d * DEG), -Math.sin(d * DEG)], [0, Math.sin(d * DEG), Math.cos(d * DEG)]];
const Rz = (d) => [[Math.cos(d * DEG), -Math.sin(d * DEG), 0], [Math.sin(d * DEG), Math.cos(d * DEG), 0], [0, 0, 1]];
const columnMajor = (r, t = [0, 0, -40]) => {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) out[col * 4 + row] = r[row][col];
  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
  return out;
};
const pose = (yaw, pitch, roll = 0) => columnMajor(mul(mul(Ry(yaw), Rx(pitch)), Rz(roll)));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Samples every 200 ms (5 fps). spec: array of 'F' (facing), 'A' (face, turned away), '-' (no face).
const series = (spec, { start = 0, step = 200, away = 30 } = {}) => [...spec].map((c, i) => ({
  t: start + i * step,
  face: c !== '-',
  yaw: c === 'F' ? 2 : c === 'A' ? away : null,
  pitch: c === '-' ? null : 1,
  eyesAway: null,
}));

test('head pose: identity is facing straight at the camera', () => {
  const p = headPoseFromMatrix(columnMajor([[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
  close(p.yaw, 0); close(p.pitch, 0); close(p.roll, 0);
});

test('head pose: recovers yaw, pitch and roll from a column-major matrix', () => {
  for (const [y, p, r] of [[20, 0, 0], [-35, 0, 0], [0, 12, 0], [0, -25, 0], [25, -10, 5], [-8, 18, -12]]) {
    const out = headPoseFromMatrix(pose(y, p, r));
    close(out.yaw, y); close(out.pitch, p); close(out.roll, r);
  }
});

test('head pose: rejects input that is not a 4x4 matrix', () => {
  assert.equal(headPoseFromMatrix(null), null);
  assert.equal(headPoseFromMatrix([1, 2, 3]), null);
  assert.equal(headPoseFromMatrix(new Array(16).fill(NaN)), null);
});

test('facing the camera means |yaw| and |pitch| both under 15 degrees', () => {
  assert.equal(isFacingCamera(14.9, -14.9), true);
  assert.equal(isFacingCamera(15, 0), false);
  assert.equal(isFacingCamera(0, -16), false);
  assert.equal(isFacingCamera(null, 0), false);
});

test('mirroring the preview does not change the metrics (only |yaw| is used)', () => {
  const left = series('FFFFAAAAAAAAAAFFFF', { away: 30 });
  const right = series('FFFFAAAAAAAAAAFFFF', { away: -30 });
  assert.deepEqual(summariseFaceSamples(left), summariseFaceSamples(right));
});

test('eye blendshapes are a supporting signal: strong same-direction looks only', () => {
  const cats = (o) => Object.entries(o).map(([categoryName, score]) => ({ categoryName, score }));
  assert.equal(eyesLookingAway(cats({ eyeLookOutLeft: 0.8, eyeLookInRight: 0.75 })), true);
  assert.equal(eyesLookingAway(cats({ eyeLookDownLeft: 0.7, eyeLookDownRight: 0.65 })), true);
  assert.equal(eyesLookingAway(cats({ eyeLookOutLeft: 0.8, eyeLookOutRight: 0.8 })), false); // cross-eyed, not a direction
  assert.equal(eyesLookingAway(cats({ eyeLookUpLeft: 0.3, eyeLookUpRight: 0.3 })), false);
  assert.equal(eyesLookingAway(undefined), null);
});

test('sampleFromResult reads MediaPipe output and handles "no face"', () => {
  assert.deepEqual(sampleFromResult({ faceLandmarks: [] }, 10), { t: 10, face: false, yaw: null, pitch: null, eyesAway: null });
  const s = sampleFromResult({
    faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: Float32Array.from(pose(20, -5)) }],
    faceBlendshapes: [{ categories: [] }],
  }, 20);
  assert.equal(s.face, true);
  close(s.yaw, 20, 1e-4); close(s.pitch, -5, 1e-4);
  const noMatrix = sampleFromResult({ faceLandmarks: [[{}]] }, 30);
  assert.equal(noMatrix.face, true);
  assert.equal(noMatrix.yaw, null);
});

test('summary: no samples gives all nulls', () => {
  assert.deepEqual(summariseFaceSamples([]), { faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null });
  assert.deepEqual(summariseFaceSamples(undefined), { faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null });
});

test('summary: camera on but no face ever (e.g. test pattern) gives 0% visible and null for the rest', () => {
  assert.deepEqual(summariseFaceSamples(series('----------')), { faceVisiblePct: 0, eyeContactPct: null, lookAwayCount: null, headMovement: null });
});

test('summary: percentages of visible face and of facing samples', () => {
  // 10 samples: 8 with a face, 6 of those facing
  const out = summariseFaceSamples(series('FFF-AAFFF-'.replace(/-/g, '-')));
  assert.equal(out.faceVisiblePct, 80);
  assert.equal(out.eyeContactPct, 75);
});

test('look-aways: only stretches of at least 1.5 s count, using timestamps', () => {
  // 7 away samples at 200 ms = 1.4 s -> not counted; 8 = 1.6 s -> counted
  assert.equal(countLookAways(series('FF' + 'A'.repeat(7) + 'FF')), 0);
  assert.equal(countLookAways(series('FF' + 'A'.repeat(8) + 'FF')), 1);
  // two long look-aways separated by facing the camera
  assert.equal(countLookAways(series('F' + 'A'.repeat(10) + 'FFF' + 'A'.repeat(9) + 'F')), 2);
  // dropped frames: 3 away samples spread over 1.8 s still count
  const sparse = [
    { t: 0, face: true, yaw: 0, pitch: 0 }, { t: 200, face: true, yaw: 40, pitch: 0 },
    { t: 1000, face: true, yaw: 40, pitch: 0 }, { t: 1800, face: true, yaw: 40, pitch: 0 }, { t: 2000, face: true, yaw: 0, pitch: 0 },
  ];
  assert.equal(countLookAways(sparse), 1);
});

test('look-aways: a missing face extends a look-away but never starts one', () => {
  assert.equal(countLookAways(series('FFAA------FF')), 1); // head turned too far to detect
  assert.equal(countLookAways(series('FF----------FF')), 0); // simply out of frame
});

test('look-aways: a pause in sampling ends the stretch', () => {
  const a = series('FAAAA', { start: 0 });
  const b = series('AAAAF', { start: 10000 });
  assert.equal(countLookAways([...a, ...b]), 0);
});

test('look-away still running at the end of the answer is counted', () => {
  assert.equal(countLookAways(series('FF' + 'A'.repeat(9))), 1);
});

test('head movement: low / medium / high from the spread of yaw and pitch', () => {
  const steady = Array.from({ length: 20 }, (_, i) => ({ t: i * 200, face: true, yaw: i % 2 ? 1 : -1, pitch: 0 }));
  const some = Array.from({ length: 20 }, (_, i) => ({ t: i * 200, face: true, yaw: i % 2 ? 7 : -7, pitch: 0 }));
  const lots = Array.from({ length: 20 }, (_, i) => ({ t: i * 200, face: true, yaw: i % 2 ? 12 : -12, pitch: i % 2 ? 6 : -6 }));
  assert.equal(headMovementLevel(steady), 'low');
  assert.equal(headMovementLevel(some), 'medium');
  assert.equal(headMovementLevel(lots), 'high');
  assert.equal(headMovementLevel(steady.slice(0, 4)), null); // too little data
});

test('live hint: "look at the camera" after 1.5 s turned away, "no face" after 2 s', () => {
  const away = series('FFF' + 'A'.repeat(9));
  assert.equal(liveHint(away, away.at(-1).t), 'look-at-camera');
  const brief = series('FFFFFFAAA');
  assert.equal(liveHint(brief, brief.at(-1).t), null);
  const gone = series('FF' + '-'.repeat(11));
  assert.equal(liveHint(gone, gone.at(-1).t), 'no-face');
  assert.equal(liveHint(gone, gone.at(-1).t + 5000), null); // stale samples: say nothing
  const eyes = series('FFFFFFFFFF').map((s, i) => ({ ...s, eyesAway: i >= 1 }));
  assert.equal(liveHint(eyes, eyes.at(-1).t), 'look-at-camera');
  assert.equal(liveHint([], 0), null);
});

test('words and words per minute', () => {
  assert.equal(countWords("I've built a REST API in Node.js, it's fast."), 9);
  assert.equal(countWords('   '), 0);
  assert.equal(wordsPerMinute('one two three four five six seven eight nine ten', 5), 120);
  assert.equal(wordsPerMinute(Array(150).fill('word').join(' '), 60), 150);
  assert.equal(wordsPerMinute('too short', 3), null);
  assert.equal(wordsPerMinute('', 60), null);
  assert.equal(wordsPerMinute('words here', null), null);
});

test('filler words: the obvious ones are always counted', () => {
  const r = countFillerWords('Um, I think, uh, the answer is umm basically a hash map. Er, erm, actually yes. Hmm.');
  assert.equal(r.byWord.um, 2);
  assert.equal(r.byWord.uh, 1);
  assert.equal(r.byWord.er, 2);
  assert.equal(r.byWord.basically, 1);
  assert.equal(r.byWord.actually, 1);
  assert.equal(r.byWord.hmm, 1);
  assert.equal(r.total, 8);
});

test('filler words: "like" only when set off by a comma, never the verb or comparison', () => {
  assert.equal(countFillerWords('It was, like, really hard.').byWord.like, 1);
  assert.equal(countFillerWords('Like, I started with tests.').byWord.like, 1);
  assert.equal(countFillerWords('I like Java and I would like to learn Go.').total, 0);
  assert.equal(countFillerWords('It looks like a tree. Something like that.').total, 0);
  assert.equal(countFillerWords('Languages I like, such as Python.').total, 0);
});

test('filler words: "you know" unless it is part of a question or clause', () => {
  assert.equal(countFillerWords('It was, you know, a big project.').byWord['you know'], 1);
  assert.equal(countFillerWords('Do you know Kubernetes? As you know, it is popular.').total, 0);
});

test('filler words: "so" only at the start of a sentence', () => {
  const r = countFillerWords('So I started early. It was so slow. So, I cached it! It is so much better.');
  assert.equal(r.byWord.so, 2);
  assert.equal(countFillerWords('I did so because it was faster.').total, 0);
});

test('filler words: empty or non-string input', () => {
  assert.deepEqual(countFillerWords(''), { total: 0, byWord: {} });
  assert.deepEqual(countFillerWords(null), { total: 0, byWord: {} });
});

test('speech metrics are null for typed answers and missing transcripts', () => {
  assert.deepEqual(speechMetrics({ spoken: false, transcript: 'typed words', durationSec: 30 }), { wordsPerMinute: null, fillerWordCount: null, durationSec: null });
  assert.deepEqual(speechMetrics({ spoken: true, transcript: '', durationSec: 30 }), { wordsPerMinute: null, fillerWordCount: null, durationSec: null });
  const s = speechMetrics({ spoken: true, transcript: Array(70).fill('word').join(' ') + ' um', durationSec: 30.04 });
  assert.equal(s.wordsPerMinute, 142);
  assert.equal(s.fillerWordCount, 1);
  assert.equal(s.durationSec, 30);
});

test('buildDeliveryMetrics returns exactly the agreed shape', () => {
  const keys = ['cameraUsed', 'faceVisiblePct', 'eyeContactPct', 'lookAwayCount', 'headMovement', 'wordsPerMinute', 'fillerWordCount', 'durationSec'];
  const noCam = buildDeliveryMetrics({ samples: [], spoken: false, transcript: 'typed', durationSec: null });
  assert.deepEqual(Object.keys(noCam), keys);
  assert.deepEqual(noCam, { cameraUsed: false, faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null, wordsPerMinute: null, fillerWordCount: null, durationSec: null });
  const withCam = buildDeliveryMetrics({ samples: series('F'.repeat(10) + 'A'.repeat(10)), spoken: true, transcript: Array(40).fill('word').join(' '), durationSec: 20 });
  assert.deepEqual(Object.keys(withCam), keys);
  assert.equal(withCam.cameraUsed, true);
  assert.equal(withCam.faceVisiblePct, 100);
  assert.equal(withCam.eyeContactPct, 50);
  assert.equal(withCam.lookAwayCount, 1);
  assert.equal(withCam.wordsPerMinute, 120);
  assert.equal(withCam.fillerWordCount, 0);
  assert.equal(withCam.durationSec, 20);
  assert.ok(['low', 'medium', 'high'].includes(withCam.headMovement));
});

test('summariseDelivery averages across answers and ignores unmeasured ones', () => {
  const s = summariseDelivery([
    { cameraUsed: true, faceVisiblePct: 100, eyeContactPct: 80, lookAwayCount: 1, headMovement: 'low', wordsPerMinute: 130, fillerWordCount: 2, durationSec: 40 },
    { cameraUsed: true, faceVisiblePct: 90, eyeContactPct: 60, lookAwayCount: 3, headMovement: 'medium', wordsPerMinute: 170, fillerWordCount: 6, durationSec: 50 },
    { cameraUsed: false, faceVisiblePct: null, eyeContactPct: null, lookAwayCount: null, headMovement: null, wordsPerMinute: null, fillerWordCount: null, durationSec: null },
    null,
  ]);
  assert.equal(s.answers, 3);
  assert.equal(s.answersWithCamera, 2);
  assert.equal(s.answersWithSpeech, 2);
  assert.equal(s.faceVisiblePct, 95);
  assert.equal(s.eyeContactPct, 70);
  assert.equal(s.lookAwayCount, 4);
  assert.equal(s.headMovement, 'low'); // tie goes to the calmer level
  assert.equal(s.wordsPerMinute, 150);
  assert.equal(s.fillerWordCount, 8);
  assert.equal(s.fillersPerAnswer, 4);
  const empty = summariseDelivery([]);
  assert.equal(empty.answers, 0);
  assert.equal(empty.eyeContactPct, null);
  assert.equal(empty.wordsPerMinute, null);
});

test('pace label and tips are plain language and never mention scores or integrity', () => {
  assert.equal(paceLabel(100), 'slow');
  assert.equal(paceLabel(140), 'good');
  assert.equal(paceLabel(190), 'fast');
  assert.equal(paceLabel(null), null);
  const tips = deliveryTips({ cameraUsed: true, faceVisiblePct: 95, eyeContactPct: 40, lookAwayCount: 4, headMovement: 'high', wordsPerMinute: 190, fillerWordCount: 9 }, { max: 10 });
  assert.equal(tips.length, 5);
  for (const t of tips) assert.doesNotMatch(t, /integrity|cheat|flag|penal|score/i);
  assert.match(deliveryTips({ cameraUsed: true, faceVisiblePct: 10, eyeContactPct: null })[0], /could not see your face/);
  assert.deepEqual(deliveryTips({ cameraUsed: true, faceVisiblePct: 100, eyeContactPct: 90, lookAwayCount: 0, headMovement: 'low', wordsPerMinute: 140, fillerWordCount: 1 }), ['Nice, steady delivery. Keep it up.']);
  assert.deepEqual(deliveryTips({ cameraUsed: false, wordsPerMinute: null, fillerWordCount: null }), []);
  assert.deepEqual(deliveryTips(null), []);
});
