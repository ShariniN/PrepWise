import { useCallback, useEffect, useRef } from 'react';
import api from '../api/client';

// Server limits: 500 events and 64 KB per batch, text cut to 2000 chars.
const MAX_EVENTS = 500;
const MAX_BYTES = 60 * 1024;
const FLUSH_MS = 10000;
const TEXT_CAP = 2000;

const sizeOf = (e) => 40 + (e.text ? e.text.length : 0);

// Records editing activity for a practice attempt and posts it in batches.
// Failures are swallowed: this must never get in the way of editing.
// `eventsPath` overrides the endpoint (assessment sessions post to their own route).
export const useEditEvents = (attemptId, eventsPath) => {
  const buffer = useRef([]);
  const bytes = useRef(0);
  const seq = useRef(0);
  const start = useRef(Date.now());
  const idRef = useRef(attemptId);
  const pathRef = useRef(eventsPath);
  const dead = useRef(false);

  useEffect(() => {
    idRef.current = attemptId;
    pathRef.current = eventsPath;
    seq.current = 0;
    buffer.current = [];
    bytes.current = 0;
    dead.current = false;
    start.current = Date.now();
  }, [attemptId, eventsPath]);

  const flush = useCallback((useBeacon = false) => {
    const id = idRef.current;
    if (!id || dead.current || buffer.current.length === 0) return;
    const events = buffer.current;
    buffer.current = [];
    bytes.current = 0;
    seq.current += 1;
    const body = { seq: seq.current, events };
    try {
      if (useBeacon && typeof fetch === 'function') {
        const base = import.meta.env.VITE_BACKEND_URL || '';
        fetch(`${base}${pathRef.current || `/api/practice/attempts/${id}/events`}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body: JSON.stringify(body),
        }).catch(() => {});
        return;
      }
      api.post(pathRef.current || `/api/practice/attempts/${id}/events`, body).catch((err) => {
        // 404/429 will not fix themselves; stop sending for this attempt.
        const s = err?.response?.status;
        if (s === 404 || s === 429) dead.current = true;
      });
    } catch {
      /* ignore */
    }
  }, []);

  const record = useCallback((type, extra = {}) => {
    if (dead.current) return;
    const ev = { t: Date.now() - start.current, type, ...extra };
    if (typeof ev.text === 'string' && ev.text.length > TEXT_CAP) ev.text = ev.text.slice(0, TEXT_CAP);
    const size = sizeOf(ev);
    if (buffer.current.length >= MAX_EVENTS || bytes.current + size > MAX_BYTES) flush();
    buffer.current.push(ev);
    bytes.current += size;
  }, [flush]);

  // Diff old/new text into a single insert/delete/paste event.
  const recordChange = useCallback((prev, next, hint) => {
    if (prev === next) return;
    let i = 0;
    const min = Math.min(prev.length, next.length);
    while (i < min && prev[i] === next[i]) i += 1;
    let pe = prev.length;
    let ne = next.length;
    while (pe > i && ne > i && prev[pe - 1] === next[ne - 1]) { pe -= 1; ne -= 1; }
    const removed = pe - i;
    const added = next.slice(i, ne);
    if (removed > 0) record('delete', { pos: i, len: removed });
    if (added.length > 0) {
      const isPaste = hint === 'paste' || added.length > 20;
      record(isPaste ? 'paste' : 'insert', { pos: i, len: added.length, text: added });
    }
  }, [record]);

  useEffect(() => {
    const timer = setInterval(() => flush(), FLUSH_MS);
    const onUnload = () => flush(true);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      flush(true);
    };
  }, [flush]);

  return { record, recordChange, flush };
};

export default useEditEvents;
