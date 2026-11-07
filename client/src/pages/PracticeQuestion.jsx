import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import NavBar from '../components/NavBar';
import Markdown from '../components/Markdown';
import CodeEditor from '../components/CodeEditor';
import ResultView from '../components/ResultView';
import AnswerInput from '../components/AnswerInput';
import VerdictBadge from '../components/VerdictBadge';
import UnavailableNotice from '../components/UnavailableNotice';
import { getQuestion, runQuestion, submitQuestion, isUnavailable } from '../api/practice';
import { errorMessage } from '../api/client';
import usePracticeDraft from '../hooks/usePracticeDraft';
import useEditEvents from '../hooks/useEditEvents';
import { isCodeType } from '../utils/practice';

const PracticeQuestion = () => {
  const { id } = useParams();
  const [question, setQuestion] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [language, setLanguage] = useState('');
  const [codes, setCodes] = useState({});
  const [answer, setAnswer] = useState('');
  const [stdin, setStdin] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [unavailable, setUnavailable] = useState(null);
  const [history, setHistory] = useState([]);
  const [initialised, setInitialised] = useState(false);

  const code = isCodeType(question?.type);
  const draft = usePracticeDraft(id, code && !!question);
  const events = useEditEvents(draft.attemptId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getQuestion(id);
        if (!cancelled) setQuestion(data.question);
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e, 'Could not load this question'));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Once the question (and the draft, for code questions) is ready, pick language and code.
  useEffect(() => {
    if (!question || initialised) return;
    if (!code) { setInitialised(true); return; }
    if (!draft.ready) return;
    const langs = question.languages || [];
    const restoredLang = draft.restored && langs.includes(draft.restored.language) ? draft.restored.language : null;
    const lang = restoredLang || langs[0] || '';
    const starts = { ...(question.starterCode || {}) };
    if (restoredLang) starts[restoredLang] = draft.restored.source;
    setLanguage(lang);
    setCodes(starts);
    setInitialised(true);
  }, [question, code, draft.ready, draft.restored, initialised]);

  const source = codes[language] ?? '';

  const onCode = useCallback((v) => {
    setCodes((c) => ({ ...c, [language]: v }));
    draft.schedule(language, v);
  }, [language, draft]);

  const onLanguage = (l) => {
    setLanguage(l);
    setResult(null);
    draft.schedule(l, codes[l] ?? '');
  };

  const record = (entry) => setHistory((h) => [{ ...entry, at: new Date() }, ...h].slice(0, 20));

  const handleError = (e, kind) => {
    setResult(null);
    if (isUnavailable(e)) {
      setUnavailable({ message: e?.response?.data?.message || '' });
      record({ kind, verdict: 'unavailable' });
      return;
    }
    const s = e?.response?.status;
    const msg = s === 429 ? 'Too many attempts, wait a minute and try again.' : errorMessage(e, 'Request failed');
    toast.error(msg);
  };

  const run = async () => {
    setBusy('run'); setUnavailable(null);
    try {
      const body = { language, source };
      if (stdin.trim()) body.stdin = stdin;
      const r = await runQuestion(id, body);
      setResult(r);
      record({ kind: 'run', verdict: r.verdict });
    } catch (e) { handleError(e, 'run'); } finally { setBusy(''); }
  };

  const submit = async () => {
    setBusy('submit'); setUnavailable(null);
    try {
      let body;
      if (code) body = { language, source };
      else if (question.type === 'mcq') body = { selected: Array.isArray(answer) ? answer : [] };
      else body = { answer: typeof answer === 'string' ? answer : '' };
      const r = await submitQuestion(id, body);
      setResult(r);
      record({ kind: 'submit', verdict: r.verdict, score: r.score });
    } catch (e) { handleError(e, 'submit'); } finally { setBusy(''); }
  };

  const canSubmit = useMemo(() => {
    if (!question) return false;
    if (code) return !!source.trim() && !!language;
    if (question.type === 'mcq') return Array.isArray(answer) && answer.length > 0;
    return typeof answer === 'string' && answer.trim().length > 0;
  }, [question, code, source, language, answer]);

  const shell = (children) => (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <Link to="/practice" className="text-sm text-indigo-700 hover:underline">&larr; All questions</Link>
        {children}
      </main>
    </div>
  );

  if (loadError) return shell(<div role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{loadError}</div>);
  if (!question || !initialised) return shell(<p className="text-gray-500" role="status">Loading question...</p>);

  const saveLabel = { saving: 'Saving...', saved: 'Draft saved', error: 'Draft not saved' }[draft.saveState];
  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';

  return shell(
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white rounded-2xl shadow p-6 space-y-3 self-start">
        <h1 className="text-xl font-bold text-gray-800">{question.title}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">{question.type}</span>
          <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{question.difficulty}</span>
          {(question.topic || []).map((t) => <span key={t} className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{t}</span>)}
          {code && <span className="text-gray-500">{question.timeLimitMs} ms, {Math.round(question.memoryLimitKb / 1024)} MB</span>}
        </div>
        <Markdown text={question.statement} />
        {code && (question.visibleTests || []).length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">Examples</h2>
            {question.visibleTests.map((t, i) => (
              <div key={t.id || i} className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-gray-500">Input</div><pre className="bg-gray-50 border rounded p-2 whitespace-pre-wrap">{t.input || '(empty)'}</pre></div>
                <div><div className="text-gray-500">Output</div><pre className="bg-gray-50 border rounded p-2 whitespace-pre-wrap">{t.expectedOutput}</pre></div>
              </div>
            ))}
            {question.hiddenTestCount > 0 && <p className="text-xs text-gray-500">{question.hiddenTestCount} more hidden tests run when you submit.</p>}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow p-6 space-y-4">
        {code ? (
          <>
            <CodeEditor
              value={source}
              onChange={onCode}
              language={language}
              languages={question.languages}
              onLanguageChange={onLanguage}
              recorder={events}
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span aria-live="polite">{saveLabel || ''}</span>
            </div>
            <label className="block text-xs text-gray-600">Custom input (optional, used by Run instead of the visible tests)
              <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} maxLength={16000}
                className="w-full mt-1 border border-gray-300 rounded p-2 font-mono text-xs" />
            </label>
          </>
        ) : (
          <AnswerInput question={question} value={answer} onChange={setAnswer} />
        )}

        <div className="flex flex-wrap gap-2">
          {code && (
            <button type="button" className={`${btn} bg-gray-200 text-gray-800 hover:bg-gray-300`} disabled={!!busy || !source.trim()} onClick={run}>
              {busy === 'run' ? 'Running...' : 'Run'}
            </button>
          )}
          <button type="button" className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={!!busy || !canSubmit} onClick={submit}>
            {busy === 'submit' ? 'Submitting...' : 'Submit'}
          </button>
        </div>

        {unavailable && <UnavailableNotice message={unavailable.message} />}
        {result && <ResultView result={result} />}

        {history.length > 0 && (
          <div>
            <h2 className="font-semibold text-sm text-gray-700 mb-1">This session</h2>
            <ul className="text-xs text-gray-600 space-y-1">
              {history.map((h, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span>{h.at.toLocaleTimeString()}</span>
                  <span className="capitalize">{h.kind}</span>
                  <VerdictBadge verdict={h.verdict} size="sm" />
                  {typeof h.score === 'number' && <span>{h.score}/100</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};

export default PracticeQuestion;
