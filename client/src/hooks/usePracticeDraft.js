import { useCallback, useEffect, useRef, useState } from 'react';
import { autosave, createDraft, getDraft } from '../api/practice';

const DEBOUNCE_MS = 1500;
const MAX_SOURCE = 64 * 1024;

// Restores the working draft for a question and autosaves edits (debounced).
// `enabled` should be true only for code questions once the question is loaded.
export const usePracticeDraft = (questionId, enabled) => {
  const [restored, setRestored] = useState(null); // { language, source } | null
  const [ready, setReady] = useState(false);
  const [attemptId, setAttemptId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const timer = useRef(null);
  const pending = useRef(null);
  const idRef = useRef(null);

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
      clearTimeout(timer.current);
    };
  }, [questionId, enabled]);

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

  const schedule = useCallback((language, source) => {
    if (!idRef.current || source.length > MAX_SOURCE) return;
    pending.current = { language, source };
    clearTimeout(timer.current);
    timer.current = setTimeout(send, DEBOUNCE_MS);
  }, [send]);

  // Flush on unmount so quick navigation does not lose the last edit.
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current) send();
  }, [send]);

  return { restored, ready, attemptId, saveState, schedule };
};

export default usePracticeDraft;
