import { useState, useRef, useCallback, useEffect } from 'react';
import { sampleFromResult, liveHint } from '../utils/coachingMetrics';

// Camera delivery coaching. Everything runs in this browser tab: frames go from the camera straight
// into MediaPipe's FaceLandmarker (WebAssembly) and only numbers come out. No frame, image or video is
// ever uploaded or stored. The model and the wasm runtime are served from /mediapipe (client/public),
// so there is no CDN dependency at runtime.

const BASE = import.meta.env.BASE_URL || '/';
const WASM_FILESET = {
  wasmLoaderPath: `${BASE}mediapipe/wasm/vision_wasm_internal.js`,
  wasmBinaryPath: `${BASE}mediapipe/wasm/vision_wasm_internal.wasm`,
};
const MODEL_PATH = `${BASE}mediapipe/face_landmarker.task`;

const SAMPLE_INTERVAL_MS = 200; // about 5 frames a second
const RECENT_WINDOW_MS = 5000; // samples kept for the live hint
const MAX_SAMPLES = 5 * 60 * 30; // 30 minutes at 5 fps, a safety cap per answer
const HINT_CLEAR_DELAY_MS = 1000; // keep a hint up briefly so it does not flicker

async function createLandmarker() {
  const vision = await import('@mediapipe/tasks-vision');
  if (!(await vision.FilesetResolver.isSimdSupported())) {
    throw new Error('This browser cannot run camera coaching (WebAssembly SIMD is not available).');
  }
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return await vision.FaceLandmarker.createFromOptions(WASM_FILESET, options('GPU'));
  } catch {
    // No usable GPU (common on older laptops and in automated browsers): the CPU path is fine at 5 fps.
    return vision.FaceLandmarker.createFromOptions(WASM_FILESET, options('CPU'));
  }
}

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was not given. You can allow it in your browser\'s site settings, or carry on without camera coaching.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. You can carry on without camera coaching.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your camera seems to be in use by another app. Close it and try again, or carry on without camera coaching.';
    default:
      return 'The camera could not be started. You can carry on without camera coaching.';
  }
}

/**
 * status: 'off' | 'starting' | 'ready' | 'error'
 * faceSeen: live, true/false while the camera is on (null when off)
 * hint: live, 'no-face' | 'look-at-camera' | null (only while sampling an answer)
 */
export function useFaceCoaching() {
  const [status, setStatus] = useState('off');
  const [error, setError] = useState('');
  const [stream, setStream] = useState(null);
  const [faceSeen, setFaceSeen] = useState(null);
  const [hint, setHint] = useState(null);

  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const landmarkerPromiseRef = useRef(null);
  const timerRef = useRef(null);
  const samplesRef = useRef([]);
  const recentRef = useRef([]);
  const samplingRef = useRef(false);
  const lastTsRef = useRef(0);
  const faceSeenRef = useRef(null);
  const hintRef = useRef(null);
  const hintClearAtRef = useRef(0);
  const runRef = useRef(0); // bumps on every start/stop so a slow start cannot revive a stopped camera
  const disposedRef = useRef(false);

  const setHintIfChanged = useCallback((next) => {
    if (hintRef.current !== next) {
      hintRef.current = next;
      setHint(next);
    }
  }, []);

  // Stop the camera and the sampling loop. Uses refs only, so it is stable for the page's lifetime.
  const releaseCamera = useCallback(() => {
    runRef.current += 1;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    samplingRef.current = false;
    recentRef.current = [];
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2 || document.hidden) return;
    // detectForVideo needs strictly increasing timestamps
    let ts = performance.now();
    if (ts <= lastTsRef.current) ts = lastTsRef.current + 1;
    lastTsRef.current = ts;
    let result;
    try {
      result = landmarker.detectForVideo(video, ts);
    } catch {
      return;
    }
    const sample = sampleFromResult(result, ts);
    const recent = recentRef.current;
    recent.push(sample);
    while (recent.length && ts - recent[0].t > RECENT_WINDOW_MS) recent.shift();

    if (samplingRef.current && samplesRef.current.length < MAX_SAMPLES) samplesRef.current.push(sample);

    // Only touch React state when something visible changes (not 5 times a second).
    if (faceSeenRef.current !== sample.face) {
      faceSeenRef.current = sample.face;
      setFaceSeen(sample.face);
    }
    const next = samplingRef.current ? liveHint(recent, ts) : null;
    if (next) {
      hintClearAtRef.current = 0;
      setHintIfChanged(next);
    } else if (hintRef.current) {
      if (!hintClearAtRef.current) hintClearAtRef.current = ts + HINT_CLEAR_DELAY_MS;
      if (ts >= hintClearAtRef.current || !samplingRef.current) {
        hintClearAtRef.current = 0;
        setHintIfChanged(null);
      }
    }
  }, [setHintIfChanged]);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    releaseCamera();
    const run = runRef.current;
    setError('');
    setStatus('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('This browser does not give web pages camera access. You can carry on without camera coaching.');
      return;
    }

    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      if (run !== runRef.current) return;
      setStatus('error');
      setError(cameraErrorMessage(err));
      return;
    }
    if (run !== runRef.current) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = media;
    setStream(media);
    // Unplugged camera, or the browser revoked access: carry on without coaching.
    media.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (streamRef.current !== media) return;
        releaseCamera();
        faceSeenRef.current = null;
        hintRef.current = null;
        setStream(null);
        setFaceSeen(null);
        setHint(null);
        setStatus('error');
        setError('The camera was disconnected. Your interview carries on without camera coaching.');
      };
    });

    // A detached <video> feeds the model, so analysis does not depend on any preview being on screen.
    // The model always sees the raw (unmirrored) camera frames.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = media;
    videoRef.current = video;

    try {
      await video.play();
      if (!landmarkerPromiseRef.current) landmarkerPromiseRef.current = createLandmarker();
      const landmarker = await landmarkerPromiseRef.current;
      if (disposedRef.current) {
        try { landmarker.close(); } catch { /* ignore */ }
        return;
      }
      landmarkerRef.current = landmarker;
    } catch (err) {
      landmarkerPromiseRef.current = null;
      if (run !== runRef.current) return;
      releaseCamera();
      setStream(null);
      setStatus('error');
      setError(`Camera coaching could not start${err?.message ? ` (${err.message})` : ''}. Your interview works as normal without it.`);
      return;
    }
    if (run !== runRef.current) return;

    timerRef.current = setInterval(tick, SAMPLE_INTERVAL_MS);
    setStatus('ready');
  }, [releaseCamera, tick]);

  // The student's off switch (and what the page calls when the interview ends).
  const stop = useCallback(() => {
    releaseCamera();
    faceSeenRef.current = null;
    hintRef.current = null;
    setStream(null);
    setFaceSeen(null);
    setHint(null);
    setError('');
    setStatus('off');
  }, [releaseCamera]);

  // Unmount: release the camera and free the model. Refs only, no state updates.
  const dispose = useCallback(() => {
    disposedRef.current = true;
    releaseCamera();
    const landmarker = landmarkerRef.current;
    landmarkerRef.current = null;
    landmarkerPromiseRef.current = null;
    if (landmarker) {
      try { landmarker.close(); } catch { /* already closed */ }
    }
  }, [releaseCamera]);

  useEffect(() => {
    disposedRef.current = false;
    return dispose;
  }, [dispose]);

  /** Record samples only while an answer is being given. */
  const setSampling = useCallback((active) => {
    samplingRef.current = !!active && !!streamRef.current;
    if (!samplingRef.current && hintRef.current) {
      hintRef.current = null;
      setHint(null);
    }
  }, []);

  const resetSamples = useCallback(() => {
    samplesRef.current = [];
  }, []);

  /** Copy of the samples of the current answer (the buffer is cleared separately with resetSamples). */
  const getSamples = useCallback(() => samplesRef.current.slice(), []);

  return {
    status,
    error,
    stream,
    faceSeen,
    hint,
    active: status === 'ready',
    start,
    stop,
    dispose,
    setSampling,
    resetSamples,
    getSamples,
  };
}
