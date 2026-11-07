import { useCallback, useEffect, useRef, useState } from 'react';
import { postIntegrityEvents, integrityEventsUrl } from '../api/integrity';

// Server limits: 100 events and 16 KB per request, 5000 per session.
const MAX_BATCH = 100;
const MAX_BYTES = 14 * 1024;
const FLUSH_MS = 5000;
const QUEUE_CAP = 1500; // client-side cap while offline; oldest dropped first
const SESSION_CAP = 4800; // stay under the server's 5000
const PASTE_DEDUPE_MS = 300;

const sizeOf = (e) => 80 + (e.detail ? e.detail.length : 0);

// Takes the next batch from the queue respecting both limits.
const takeBatch = (queue) => {
  const batch = [];
  let bytes = 0;
  while (queue.length && batch.length < MAX_BATCH) {
    const s = sizeOf(queue[0]);
    if (batch.length && bytes + s > MAX_BYTES) break;
    bytes += s;
    batch.push(queue.shift());
  }
  return batch;
};

const inEditorTarget = (t) => !!(t && t.closest && t.closest('[data-integrity-editor]'));

// Level 1 integrity signals (browser only: no camera, no screen capture).
// opts: { sessionId, signals (what the server wants reported), enabled,
//   serverElapsedMs (ms since the session started when the page loaded: serverNow - serverStartedAt),
//   getQuestionId }
// Returns { offline, returnedNotice, dismissNotice, flush, record }. Never throws, never blocks the student.
export const useIntegrityEvents = ({ sessionId, signals, enabled, serverElapsedMs, getQuestionId }) => {
  const queue = useRef([]);
  const sent = useRef(0);
  const dead = useRef(false);
  const flushing = useRef(false);
  const perf0 = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const elapsed0 = useRef(serverElapsedMs || 0);
  const hiddenAt = useRef(null);
  const lastPaste = useRef(0);
  const qidRef = useRef(getQuestionId);
  const allowed = useRef(new Set());
  const enabledRef = useRef(enabled);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? navigator.onLine === false : false);
  const [returnedNotice, setReturnedNotice] = useState(null);

  useEffect(() => { qidRef.current = getQuestionId; }, [getQuestionId]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { allowed.current = new Set(signals || []); }, [signals]);
  useEffect(() => {
    perf0.current = performance.now();
    elapsed0.current = serverElapsedMs || 0;
    dead.current = false;
    // Re-anchor only when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const record = useCallback((type, extra = {}) => {
    if (!enabledRef.current || dead.current || !allowed.current.has(type)) return;
    if (sent.current + queue.current.length >= SESSION_CAP) return;
    const t = Math.max(0, Math.round(elapsed0.current + (performance.now() - perf0.current)));
    const ev = { type, t, ...extra };
    const qid = qidRef.current?.();
    if (qid) ev.questionId = qid;
    if (typeof ev.detail === 'string') ev.detail = ev.detail.slice(0, 100);
    queue.current.push(ev);
    if (queue.current.length > QUEUE_CAP) queue.current.splice(0, queue.current.length - QUEUE_CAP);
  }, []);

  const flush = useCallback(async (keepalive = false) => {
    if (!sessionId || dead.current || flushing.current || queue.current.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (keepalive && typeof fetch === 'function') {
      // Page is going away: send what fits in one request and do not wait for it.
      const batch = takeBatch(queue.current);
      try {
        fetch(integrityEventsUrl(sessionId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify({ events: batch }),
        }).catch(() => {});
        sent.current += batch.length;
      } catch { queue.current.unshift(...batch); }
      return;
    }
    flushing.current = true;
    try {
      while (queue.current.length && !dead.current) {
        const batch = takeBatch(queue.current);
        try {
          const r = await postIntegrityEvents(sessionId, batch);
          sent.current += (r?.stored || 0) + (r?.ignored || 0);
        } catch (err) {
          const s = err?.response?.status;
          if (!err?.response || s >= 500) { queue.current.unshift(...batch); break; } // network problem: retry later
          if (s === 429 || s === 409 || s === 404 || s === 413) dead.current = true; // will not fix itself
          break; // other 4xx: drop this batch
        }
      }
    } finally { flushing.current = false; }
  }, [sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        record('tab_hidden');
        flush(true);
      } else {
        const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
        hiddenAt.current = null;
        record('tab_visible');
        if (allowed.current.has('tab_hidden')) setReturnedNotice({ ms: away, at: Date.now() });
      }
    };
    const onBlur = () => record('window_blur');
    const onFocus = () => record('window_focus');
    const onFullscreen = () => { if (!document.fullscreenElement) record('fullscreen_exit'); };
    const onPaste = (e) => {
      const nowMs = Date.now();
      if (nowMs - lastPaste.current < PASTE_DEDUPE_MS) return;
      lastPaste.current = nowMs;
      let len = 0;
      try { len = (e.clipboardData?.getData('text') || '').length; } catch { /* ignore */ }
      record('paste', { len, inEditor: inEditorTarget(e.target) });
    };
    const onCopy = (e) => record('copy', { inEditor: inEditorTarget(e.target) });
    const onCut = (e) => record('cut', { inEditor: inEditorTarget(e.target) });
    const onContext = (e) => { if (inEditorTarget(e.target)) record('contextmenu', { inEditor: true }); };
    const onOffline = () => { setOffline(true); record('network_offline'); };
    const onOnline = () => { setOffline(false); record('network_online'); flush(); };
    const onHide = () => flush(true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('contextmenu', onContext, true);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onHide);

    // Multi-screen hint where the Window Management API exposes it (Chromium). Silent elsewhere.
    let screenObj = null;
    const onScreens = () => { if (screenObj?.isExtended) record('multiple_screens_hint', { detail: 'screen.isExtended' }); };
    try {
      if (typeof window.screen !== 'undefined' && 'isExtended' in window.screen) {
        screenObj = window.screen;
        onScreens();
        screenObj.addEventListener?.('change', onScreens);
      }
    } catch { /* not available */ }

    const timer = setInterval(() => flush(), FLUSH_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('contextmenu', onContext, true);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onHide);
      try { screenObj?.removeEventListener?.('change', onScreens); } catch { /* ignore */ }
      flush(true);
    };
  }, [enabled, sessionId, record, flush]);

  const dismissNotice = useCallback(() => setReturnedNotice(null), []);
  return { offline, returnedNotice, dismissNotice, flush, record };
};

export default useIntegrityEvents;
