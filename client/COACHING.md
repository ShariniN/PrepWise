# Camera interview coaching

Optional delivery coaching for the AI mock interview (`/interview`). It works like the feedback in
interview-practice tools: how you came across, not what you said. It is **coaching only**. It never changes a
score, raises no flags, and is not exam monitoring.

## What the student sees

- **Setup screen:** a "Camera coaching (optional)" switch, off by default and off again at the start of every
  interview. Turning it on asks for camera permission, shows a mirrored preview to check framing, and says
  "Face detected" or "No face detected yet".
- **During the interview:** a small self-view in the bottom-right corner with a status dot, a "hide preview"
  button (coaching carries on) and a "turn camera off" button. A gentle hint appears when needed: "Try to look
  at the camera" or "We can't see your face. Check your framing and light."
- **Report:** a "Delivery" summary across answers plus a small "Delivery" card on each answered question, with
  plain-language tips and the note "Measured on your device. No video was recorded or uploaded."

If the camera is blocked, missing, busy or the model cannot load, the student gets a friendly message with
"Try again", and the interview works exactly as before.

## What is measured, and how

Face analysis uses MediaPipe FaceLandmarker (`@mediapipe/tasks-vision` 0.10.21) in VIDEO mode, at about
5 frames a second. Samples are kept **only while an answer is being given**: while recording a spoken answer,
or while the answer screen is open for typed and coding answers. Samples restart for each question, each
answer mode and each new recording. Nothing is kept while submitting.

| Metric | Definition |
| --- | --- |
| `faceVisiblePct` | % of samples in which a face was found. |
| `eyeContactPct` | % of face samples where the head faces the camera: \|yaw\| < 15° and \|pitch\| < 15°. |
| `lookAwayCount` | Number of times the head was turned away for 1.5 s or longer (timestamp based). |
| `headMovement` | `low` / `medium` / `high` from the spread (std dev) of yaw and pitch: under 5°, 5-10°, over 10°. |
| `wordsPerMinute` | Transcript words ÷ recording minutes. Friendly target 120-160. |
| `fillerWordCount` | Filler words in the transcript (rules below). |
| `durationSec` | Length of the spoken recording in seconds. |

- Head yaw and pitch come from `facialTransformationMatrixes` (4x4, column-major), decomposed as
  R = Ry(yaw)·Rx(pitch)·Rz(roll).
- **Look-aways:** an episode starts when a face is seen with the head turned away. A sample with no face
  extends an episode that is already running, because the head may be turned too far to detect, but it never
  starts one. Someone who is simply out of frame shows up in `faceVisiblePct` instead. A gap in sampling
  ends the episode.
- **Eye blendshapes** (eyeLookIn/Out/Up/Down) are a supporting signal for the live hint only. They do not
  feed `eyeContactPct`.
- **Speech numbers** exist only for spoken answers with a real transcript. They are `null` for typed and code
  answers, and for transcripts typed by hand after a failed transcription.
- **No samples** (camera off): `cameraUsed: false` and every face field is `null`. **Camera on but no face
  ever** (e.g. the fake test-pattern camera): `faceVisiblePct: 0`, everything else `null`. The report says
  "No face detected" rather than showing 0% eye contact.

Filler words, chosen to under-count rather than over-count:

- `um`, `uh`, `er`/`erm`, `hmm` (and their stretched spellings) are always counted.
- `like` counts only when followed by a comma ("it was, like, fine") and not after words that make it a verb
  or a comparison ("I like, ...", "looks like, ...").
- `you know` counts unless it is part of a question or clause ("do you know", "as you know").
- `basically` and `actually` are always counted. They are sometimes meaningful, so expect a small over-count.
- `so` counts only at the start of a sentence.

All of this maths lives in `src/utils/coachingMetrics.js`. It is pure ESM with no browser APIs, and is unit
tested from the server suite: `server/tests/coaching-metrics.test.js`.

## Data sent and stored

Each submit-answer request carries:

```json
{ "deliveryMetrics": { "cameraUsed": true, "faceVisiblePct": 92, "eyeContactPct": 71, "lookAwayCount": 2,
  "headMovement": "medium", "wordsPerMinute": 138, "fillerWordCount": 4, "durationSec": 41.5 } }
```

The server (`sanitizeDeliveryMetrics` in `server/controllers/interviewController.js`) is strict:

- Wrong types become `null` (for example `"80"` is not 80).
- Numbers are clamped (percentages 0-100, counts are non-negative integers, wpm up to 600, duration up to 2 hours).
- Unknown keys are dropped, and camera fields are `null` unless `cameraUsed === true`.
- Nothing is ever rejected.

The result is stored as `responses[].deliveryMetrics`. The metrics are never sent to the AI and never affect
any score. `GET /api/interviews/:id/feedback` (and the complete endpoint) return the per-answer metrics plus
a `deliverySummary`.

## Privacy

- Camera frames go straight from the camera into the model running in the browser tab (WebAssembly). No
  frame, image or video is uploaded, recorded or stored, and only the numbers above leave the device.
- The model (`public/mediapipe/face_landmarker.task`) and the wasm runtime (`public/mediapipe/wasm/`) are served
  by the app itself, so there is no CDN or third-party request at runtime.
- The camera is released when the student turns coaching off, when the interview finishes, and when the page
  is left. Camera access is opt-in for every interview.

## Limits

- **Head direction, not gaze.** "Eye contact" means the head faces the camera. Someone facing the camera but
  looking at notes still counts as eye contact. Real gaze tracking needs per-user calibration, which this
  does not do.
- **Camera placement.** If the camera sits off to the side of the screen (an external webcam), reading the
  screen looks like turning away. The 15° threshold gives some slack, but not for a camera mounted far to
  the side.
- **Lighting.** Strong backlight, very dim rooms and faces partly out of frame reduce face detection, so
  numbers drop.
- **Glasses.** Reflective lenses can hurt eye blendshapes (the live hint) but rarely head pose.
- **Mirrored self-view.** The preview is mirrored with CSS only. The model always sees the raw, unmirrored
  frames, and the metrics only use |yaw| and |pitch|. The live hint is deliberately not directional ("look
  left"), so mirroring can never make it point the wrong way.
- **Pace** depends on the recording length, which includes pauses before and after speaking. Answers under
  5 seconds get no pace.
- **Filler words are under-counted at the source.** The transcription service (AssemblyAI) removes "um" and
  "uh" from transcripts unless `disfluencies: true` is sent with the transcription request (see the
  `/transcribe` route in `server/routes/InterviewRoutes.js`). Transcripts without punctuation also
  under-count comma-based `like`.
- **Browser support** needs WebAssembly SIMD (all current Chrome, Edge, Firefox and Safari 16.4+). Older
  browsers get "could not start" and carry on without coaching. The GPU path is tried first, with a CPU
  fallback.

## Files

- `src/hooks/useFaceCoaching.js`: camera, model, sampling loop and live hint. It keeps everything in refs and
  updates React state only when something visible changes.
- `src/components/coaching/*`: the setup block, self-view, per-answer card and report summary.
- `src/utils/coachingMetrics.js`: the pure maths.
- `vendor/mediapipe-tasks-vision/`: the npm package files, hash-checked against jsDelivr's listing for
  0.10.21. It is vendored because the npm registry was not reachable when this was built. Swap it for
  `"@mediapipe/tasks-vision": "0.10.21"` once it is.
