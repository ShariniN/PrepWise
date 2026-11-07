import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from '../Markdown';
import CodeEditor from '../CodeEditor';
import AnswerInput from '../AnswerInput';
import ResultView from '../ResultView';
import UnavailableNotice from '../UnavailableNotice';
import useEditEvents from '../../hooks/useEditEvents';
import {
  getSessionQuestion, runSessionQuestion, submitSessionQuestion, autosaveSessionQuestion,
} from '../../api/assessments';
import { errorMessage, errorCode } from '../../api/client';
import { isUnavailable } from '../../api/practice';
import { isCodeType } from '../../utils/practice';

const AUTOSAVE_MS = 1500;
const ANSWER_SAVE_MS = 4000;
const RETRY_MS = 10000;
const MAX_SOURCE = 64 * 1024;

const backupKey = (sid, qid) => `prepwise.sessdraft.${sid}.${qid}`;
const readBackup = (sid, qid) => { try { return JSON.parse(localStorage.getItem(backupKey(sid, qid)) || 'null'); } catch { return null; } };
const writeBackup = (sid, qid, v) => { try { localStorage.setItem(backupKey(sid, qid), JSON.stringify({ ...v, at: Date.now() })); } catch { /* optional */ } };

// One question inside an assessment session. Remount (key) when the question changes.
const SessionQuestion = ({ sessionId, questionId, onTimeUp, onEnded, onSubmitted, onPending }) => {
  const [question, setQuestion] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [language, setLanguage] = useState('');
  const [codes, setCodes] = useState({});
  const [answer, setAnswer] = useState('');
  const [stdin, setStdin] = useState('');
  const [busy, setBusy] = useState('');
  const [runOut, setRunOut] = useState(null);
  const [released, setReleased] = useState(null);
  const [notice, setNotice] = useState('');
  const [unavailable, setUnavailable] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | retrying
  const pending = useRef(null); // { kind: 'draft'|'answer', body }
  const timer = useRef(null);

  const code = isCodeType(question?.type);
  const eventsPath = `/api/assessments/sessions/${sessionId}/questions/${questionId}/events`;
  const events = useEditEvents(question && code ? questionId : null, eventsPath);

  // Handles the timer and session errors that every write route can return. Returns true if handled.
  const handleSession = useCallback((e) => {
    const c = errorCode(e);
    if (c === 'TIME_UP') { onTimeUp(); return true; }
    if (c === 'SESSION_ENDED' || c === 'ASSESSMENT_CLOSED') { onEnded(c); return true; }
    return false;
  }, [onTimeUp, onEnded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getSessionQuestion(sessionId, questionId);
        if (cancelled) return;
        const q = data.question;
        const backup = readBackup(sessionId, questionId);
        const draft = data.draft;
        if (isCodeType(q.type)) {
          const langs = q.languages || [];
          const newer = backup && backup.source != null && (!draft || backup.at > Date.parse(draft.updatedAt || 0));
          const src = newer ? backup : draft;
          const lang = src && langs.includes(src.language) ? src.language : langs[0] || '';
          const starts = { ...(q.starterCode || {}) };
          if (src && src.source != null && langs.includes(src.language)) starts[src.language] = src.source;
          setLanguage(lang); setCodes(starts);
          if (newer) pending.current = { kind: 'draft', body: { language: backup.language, source: backup.source } };
        } else if (backup && backup.answer != null) {
          setAnswer(backup.answer);
        }
        setQuestion(q);
      } catch (e) {
        if (cancelled) return;
        if (!handleSession(e)) setLoadError(errorMessage(e, 'Could not load this question. Check your connection and try again.'));
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, questionId, handleSession]);

  const answerBody = useCallback(() => {
    if (question.type === 'mcq') return { selected: Array.isArray(answer) ? answer : [] };
    return { answer: typeof answer === 'string' ? answer : '' };
  }, [question, answer]);

  const flushPending = useCallback(async () => {
    const job = pending.current;
    if (!job) return;
    setSaveState('saving');
    try {
      if (job.kind === 'draft') await autosaveSessionQuestion(sessionId, questionId, job.body);
      else { await submitSessionQuestion(sessionId, questionId, job.body); onSubmitted(questionId); }
      if (pending.current === job) pending.current = null;
      setSaveState('saved');
      onPending(!!pending.current);
    } catch (e) {
      if (handleSession(e)) return;
      if (e?.response && e.response.status < 500 && e.response.status !== 429) { pending.current = null; setSaveState('idle'); onPending(false); return; }
      setSaveState('retrying'); // offline or server trouble: kept locally, retried below
      onPending(true);
    }
  }, [sessionId, questionId, handleSession, onSubmitted, onPending]);

  const schedule = useCallback((job, ms) => {
    pending.current = job;
    onPending(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(flushPending, ms);
  }, [flushPending, onPending]);

  // Retry while something is pending, and as soon as the browser says we are online again.
  useEffect(() => {
    const retry = () => { if (pending.current) flushPending(); };
    const iv = setInterval(retry, RETRY_MS);
    window.addEventListener('online', retry);
    return () => { clearInterval(iv); window.removeEventListener('online', retry); };
  }, [flushPending]);

  // Send the last edit when moving to another question.
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  const flushRef = useRef(flushPending);
  useEffect(() => { flushRef.current = flushPending; }, [flushPending]);
  useEffect(() => () => { if (pending.current) flushRef.current(); }, []);

  const source = codes[language] ?? '';

  const onCode = (v) => {
    setCodes((c) => ({ ...c, [language]: v }));
    writeBackup(sessionId, questionId, { language, source: v });
    if (v.length <= MAX_SOURCE) schedule({ kind: 'draft', body: { language, source: v } }, AUTOSAVE_MS);
  };
  const onLanguage = (l) => {
    setLanguage(l); setRunOut(null);
    const v = codes[l] ?? '';
    writeBackup(sessionId, questionId, { language: l, source: v });
    schedule({ kind: 'draft', body: { language: l, source: v } }, AUTOSAVE_MS);
  };
  const onAnswer = (v) => {
    setAnswer(v); setNotice('');
    writeBackup(sessionId, questionId, { answer: v });
    const body = question.type === 'mcq' ? { selected: Array.isArray(v) ? v : [] } : { answer: typeof v === 'string' ? v : '' };
    const ok = question.type === 'mcq' ? body.selected.length > 0 : body.answer.trim().length > 0;
    if (ok) schedule({ kind: 'answer', body }, question.type === 'mcq' ? 800 : ANSWER_SAVE_MS);
  };

  const run = async () => {
    setBusy('run'); setUnavailable(null);
    try {
      const body = { language, source };
      if (stdin.trim()) body.stdin = stdin;
      setRunOut(await runSessionQuestion(sessionId, questionId, body));
    } catch (e) {
      if (handleSession(e)) return;
      setRunOut(null);
      if (isUnavailable(e)) setUnavailable({ message: e?.response?.data?.message || '' });
      else setNotice(e?.response ? errorMessage(e, 'Run failed') : 'You seem to be offline. Your code is still saved on this device.');
    } finally { setBusy(''); }
  };

  const submit = async () => {
    setBusy('submit'); setUnavailable(null); setNotice('');
    clearTimeout(timer.current);
    try {
      const body = code ? { language, source } : answerBody();
      if (code) pending.current = null;
      const r = await submitSessionQuestion(sessionId, questionId, body);
      onSubmitted(questionId);
      if (!code) pending.current = null;
      onPending(!!pending.current);
      setSaveState('saved');
      setNotice('Answer saved');
      setReleased(r.verdict ? r : null);
    } catch (e) {
      if (handleSession(e)) return;
      if (isUnavailable(e)) setUnavailable({ message: e?.response?.data?.message || '' });
      else if (!e?.response) setNotice('You seem to be offline. Your answer is kept on this device; press Submit again when you are back online. This is not counted against you.');
      else setNotice(e.response.status === 429 ? 'Too many submissions, wait a minute and try again.' : errorMessage(e, 'Submit failed'));
    } finally { setBusy(''); }
  };

  const canSubmit = useMemo(() => {
    if (!question) return false;
    if (code) return !!source.trim() && !!language;
    if (question.type === 'mcq') return Array.isArray(answer) && answer.length > 0;
    return typeof answer === 'string' && answer.trim().length > 0;
  }, [question, code, source, language, answer]);

  if (loadError) return <div role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{loadError}</div>;
  if (!question) return <p className="text-gray-500" role="status">Loading question...</p>;

  const saveLabel = { saving: 'Saving...', saved: 'Saved', retrying: 'Not saved yet, will retry' }[saveState] || '';
  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white rounded-2xl shadow p-6 space-y-3 self-start">
        <h2 className="text-xl font-bold text-gray-800">{question.title}</h2>
        <Markdown text={question.statement} />
        {code && (question.visibleTests || []).length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700">Examples</h3>
            {question.visibleTests.map((t, i) => (
              <div key={t.id || i} className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-gray-500">Input</div><pre className="bg-gray-50 border rounded p-2 whitespace-pre-wrap">{t.input || '(empty)'}</pre></div>
                <div><div className="text-gray-500">Output</div><pre className="bg-gray-50 border rounded p-2 whitespace-pre-wrap">{t.expectedOutput}</pre></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow p-6 space-y-4">
        {code ? (
          <>
            <div data-integrity-editor>
              <CodeEditor value={source} onChange={onCode} language={language} languages={question.languages}
                onLanguageChange={onLanguage} recorder={events} />
            </div>
            <label className="block text-xs text-gray-600">Custom input (optional, used by Run)
              <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} maxLength={16000}
                className="w-full mt-1 border border-gray-300 rounded p-2 font-mono text-xs" />
            </label>
          </>
        ) : (
          <div data-integrity-editor><AnswerInput question={question} value={answer} onChange={onAnswer} /></div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {code && (
            <button type="button" className={`${btn} bg-gray-200 text-gray-800 hover:bg-gray-300`} disabled={!!busy || !source.trim()} onClick={run}>
              {busy === 'run' ? 'Running...' : 'Run'}
            </button>
          )}
          <button type="button" className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={!!busy || !canSubmit} onClick={submit}>
            {busy === 'submit' ? 'Saving...' : 'Submit answer'}
          </button>
          <span className="text-xs text-gray-500" aria-live="polite">{saveLabel}</span>
        </div>
        {notice && <p role="status" className="text-sm font-medium text-green-800">{notice}</p>}
        {unavailable && <UnavailableNotice message={unavailable.message} />}
        {runOut && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Run output only. Runs are not marked and no results are shown during the assessment.</p>
            <ResultView result={{ stdout: runOut.stdout, stderr: runOut.stderr, compileOutput: runOut.compileOutput, timeMs: runOut.timeMs }} />
          </div>
        )}
        {released && <ResultView result={released} />}
        {!released && notice === 'Answer saved' && (
          <p className="text-xs text-gray-500">You can change your answer and submit again; the last submission counts.</p>
        )}
      </section>
    </div>
  );
};

export default SessionQuestion;
