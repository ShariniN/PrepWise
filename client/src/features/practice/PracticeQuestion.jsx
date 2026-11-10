import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import AppShell from '../../components/AppShell';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, Card, Skeleton, Textarea } from '../../components/ui';
import Markdown from '../../components/Markdown';
import CodeEditor from '../../components/CodeEditor';
import ResultView from './components/ResultView';
import AnswerInput from '../../components/AnswerInput';
import VerdictBadge from './components/VerdictBadge';
import UnavailableNotice from '../../components/UnavailableNotice';
import { getQuestion, runQuestion, submitQuestion, recordBrowserRun, isUnavailable } from './api';
import { runInBrowser, BROWSER_LANGUAGES } from './browserRunner';
import { errorMessage } from '../../lib/apiClient';
import usePracticeDraft from './hooks/usePracticeDraft';
import { isCodeType } from './utils';

// True when the statement already contains this test's input and output (e.g. in its own "Example" section),
// so the page does not show the same example twice.
const normEx = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const exampleInStatement = (statement, t) => {
  const text = normEx(statement);
  const input = normEx(t.input);
  const output = normEx(t.expectedOutput);
  return !!input && !!output && text.includes(input) && text.includes(output);
};

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

  // Python and JavaScript run on the visible tests in the student's browser. Null means the browser cannot run this
  // program the way the server would, and the server Run is used instead.
  const runLocally = async () => {
    const tests = question.visibleTests || [];
    if (!BROWSER_LANGUAGES.includes(language) || stdin.trim() || !tests.length) return null;
    const r = await runInBrowser({
      language, source, tests, timeLimitMs: question.timeLimitMs,
      onStatus: (s) => setBusy(s === 'loading' ? 'loading' : 'run'),
    });
    if (!r) return null;
    const rows = r.perTest.map((t, i) => {
      const test = tests.find((x) => x.id === t.testId) || tests[i];
      const verdict = t.passed ? 'accepted' : (t.timedOut ? 'time_limit' : (t.stderr ? 'runtime_error' : 'wrong_answer'));
      return {
        index: i + 1, testId: t.testId, visible: true, passed: t.passed, verdict, timeMs: null, memoryKb: null,
        input: test?.input, expectedOutput: test?.expectedOutput, actualOutput: t.stdout, error: t.stderr,
      };
    });
    const failed = rows.find((t) => !t.passed);
    return {
      success: true, mode: 'visible_tests', ranIn: 'browser', verdict: failed ? failed.verdict : 'accepted',
      passed: rows.filter((t) => t.passed).length, total: rows.length, tests: rows,
    };
  };

  const run = async () => {
    setBusy('run'); setUnavailable(null);
    try {
      const local = await runLocally();
      if (local) {
        setResult(local);
        record({ kind: 'run', verdict: local.verdict });
        recordBrowserRun(id, { language, source }).catch(() => {});
        return;
      }
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
    <AppShell width="wide">
      <Link to="/practice" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
        <ArrowLeft size={16} aria-hidden="true" /> All questions
      </Link>
      {children}
    </AppShell>
  );

  if (loadError) return shell(<div role="alert" className="rounded-3xl border border-danger-100 bg-danger-100 p-6 text-danger-700">{loadError}</div>);
  if (!question || !initialised) return shell(<div role="status" aria-label="Loading question"><Skeleton className="h-96 w-full" rounded="rounded-3xl" /></div>);

  const saveLabel = { saving: 'Saving...', saved: 'Draft saved', error: 'Draft not saved' }[draft.saveState];
  // Visible tests that the statement does not already show as its own example (seed statements include one).
  const extraExamples = (question.visibleTests || []).filter((t) => !exampleInStatement(question.statement, t));
  return shell(
    <div className="grid gap-5 lg:grid-cols-2">
      <Card as="section" className="space-y-4 self-start">
        <h1 className="font-display text-2xl font-semibold text-ink">{question.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{question.type}</Badge>
          <Badge>{question.difficulty}</Badge>
          {(question.topic || []).map((t) => <Badge key={t}>{t}</Badge>)}
          {code && <span className="text-xs text-ink-muted">{question.timeLimitMs} ms, {Math.round(question.memoryLimitKb / 1024)} MB</span>}
        </div>
        <Markdown text={question.statement} />
        {code && (question.visibleTests || []).length > 0 && (
          <div className="space-y-3">
            {extraExamples.length > 0 && (
              <h2 className="font-display text-base font-semibold text-ink">{extraExamples.length < question.visibleTests.length ? 'More examples' : 'Examples'}</h2>
            )}
            {extraExamples.map((t, i) => (
              <div key={t.id || i} className="grid gap-2 text-xs sm:grid-cols-2">
                <div><div className="mb-1 font-medium text-ink-muted">Input</div><pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-sand p-3 text-ink">{t.input || '(empty)'}</pre></div>
                <div><div className="mb-1 font-medium text-ink-muted">Output</div><pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-sand p-3 text-ink">{t.expectedOutput}</pre></div>
              </div>
            ))}
            {question.hiddenTestCount > 0 && <p className="text-xs text-ink-muted">{question.hiddenTestCount} more hidden tests run when you submit.</p>}
          </div>
        )}
      </Card>

      <Card as="section" className="min-w-0 space-y-4">
        {code ? (
          <>
            <CodeEditor
              value={source}
              onChange={onCode}
              language={language}
              languages={question.languages}
              onLanguageChange={onLanguage}
            />
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span aria-live="polite">{saveLabel || ''}</span>
            </div>
            <div>
              <label htmlFor="pq-stdin" className="mb-1.5 block text-xs font-medium text-ink-2">Custom input (optional, used by Run instead of the visible tests)</label>
              <Textarea id="pq-stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} maxLength={16000} className="font-mono text-xs" />
            </div>
          </>
        ) : (
          <AnswerInput question={question} value={answer} onChange={setAnswer} />
        )}

        <div className="flex flex-wrap gap-3">
          {code && (
            <Button variant="secondary" disabled={!!busy || !source.trim()} onClick={run}>
              {busy === 'loading' ? 'Loading Python...' : busy === 'run' ? 'Running...' : 'Run'}
            </Button>
          )}
          <Button disabled={!!busy || !canSubmit} onClick={submit}>
            {busy === 'submit' ? 'Submitting...' : 'Submit'}
          </Button>
        </div>

        {unavailable && <UnavailableNotice message={unavailable.message} />}
        {result && <ResultView result={result} />}

        {history.length > 0 && (
          <div>
            <h2 className="mb-2 font-display text-base font-semibold text-ink">This session</h2>
            <ul className="space-y-1.5 text-xs text-ink-2">
              {history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span>{h.at.toLocaleTimeString()}</span>
                  <span className="capitalize">{h.kind}</span>
                  <VerdictBadge verdict={h.verdict} size="sm" />
                  {typeof h.score === 'number' && <span>{h.score}/100</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PracticeQuestion;
