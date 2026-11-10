import { useCallback, useEffect, useRef, useState } from 'react';
import { autosave, createDraft, getDraft } from '../api/practice';
import { backendUrl } from '../api/client';

const DEBOUNCE_MS = 1500;
const MAX_SOURCE = 64 * 1024;

// Sends a draft while the page is being unloaded (reload, typed URL, closed tab). A normal request is cancelled
// by the browser at that point; a keepalive fetch is allowed to finish. Keepalive bodies are limited (about 64 KB
// shared with other keepalive requests), so a failure here is ignored and the debounced save is the main path.
const sendOnUnload = (attemptId, job) => {
  try {
    fetch(`${backendUrl}/api/practice/attempts/${attemptId}/autosave`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(job),
    }).catch(() => {});
  } catch {
    /* ignore: best effort */
  }
};

// Restores the working draft for a question and autosaves edits (debounced).
// `enabled` should be true only for code questions once the question is loaded.
// A pending edit is never dropped: it is flushed when the question changes, when the page unmounts
// (in-app navigation) and when the page itself is unloaded (reload, typed URL, closed tab).
export const usePracticeDraft = (questionId, enabled) => {
  const [restored, setRestored] = useState(null); // { language, source } | null
  const [ready, setReady] = useState(false);
  const [attemptId, setAttemptId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const timer = useRef(null);
  const pending = useRef(null);
  const idRef = useRef(null);

  const send = useCallback(async () => {
    const job = pending.current;
    pending.current = null;
    if (!job || !idRef.current) return;
    setSaveState('saving');
    try {
      await autosave(idRef.current, job);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  // Save now whatever is waiting for the debounce. `unloading` uses a keepalive request.
  const flush = useCallback((unloading = false) => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current || !idRef.current) return;
    if (unloading) {
      const job = pending.current;
      pending.current = null;
      sendOnUnload(idRef.current, job);
    } else {
      send();
    }
  }, [send]);

  useEffect(() => {
    if (!enabled || !questionId) return undefined;
    let cancelled = false;
    (async () => {
      let draft = null;
      try {
        draft = (await getDraft(questionId)).draft;
        if (!draft) draft = (await createDraft(questionId)).draft;
      } catch {
        /* drafts are best effort; the page still works without them */
      }
      if (cancelled) return;
      idRef.current = draft?.attemptId || null;
      setAttemptId(idRef.current);
      setRestored(draft && draft.source ? { language: draft.language, source: draft.source } : null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      // Moving to another question: save the last edit of this one before the attempt id changes.
      flush();
    };
  }, [questionId, enabled, flush]);

  const schedule = useCallback((language, source) => {
    if (!idRef.current || source.length > MAX_SOURCE) return;
    pending.current = { language, source };
    clearTimeout(timer.current);
    timer.current = setTimeout(send, DEBOUNCE_MS);
  }, [send]);

  // Full page unloads (reload, typed URL, closing the tab) and unmount (in-app navigation).
  useEffect(() => {
    const onUnload = () => flush(true);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      flush();
    };
  }, [flush]);

  return { restored, ready, attemptId, saveState, schedule, flush };
};

export default usePracticeDraft;
