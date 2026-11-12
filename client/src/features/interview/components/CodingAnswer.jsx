import React, { useEffect, useState } from 'react';
import { Code, Terminal } from 'lucide-react';
import { Button } from '../../../components/ui';
import CodeEditor from '../../../components/CodeEditor';
import Markdown from '../../../components/Markdown';
import UnavailableNotice from '../../../components/UnavailableNotice';
import ResultView from '../../practice/components/ResultView';
import { runQuestion, isUnavailable } from '../../practice/api';
import { runInBrowser, BROWSER_LANGUAGES, warmUpPython } from '../../practice/browserRunner';
import { errorMessage } from '../../../lib/apiClient';

// Rows for ResultView from a browser run on the visible tests (the same shape the server's Run returns).
const browserResult = (run, tests) => {
  const rows = run.perTest.map((t, i) => {
    const test = tests.find((x) => x.id === t.testId) || tests[i];
    const verdict = t.passed ? 'accepted' : (t.timedOut ? 'time_limit' : (t.stderr ? 'runtime_error' : 'wrong_answer'));
    return {
      index: i + 1, testId: t.testId, visible: true, passed: t.passed, verdict, timeMs: null, memoryKb: null,
      input: test?.input, expectedOutput: test?.expectedOutput, actualOutput: t.stdout, error: t.stderr,
    };
  });
  const failed = rows.find((t) => !t.passed);
  return { mode: 'visible_tests', ranIn: 'browser', verdict: failed ? failed.verdict : 'accepted', passed: rows.filter((t) => t.passed).length, total: rows.length, tests: rows };
};

// The coding slot: a seeded practice question. Run tries the visible tests in the browser (Python, JavaScript) and
// uses the server otherwise; it is never scored. Submit sends the code to the interview, which marks it on the
// server against all of the question's tests.
const CodingAnswer = ({ question, code, onCode, language, onLanguage }) => {
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [unavailable, setUnavailable] = useState(null);
  const [runError, setRunError] = useState('');
  const tests = question.visibleTests || [];
  const canRun = !!question.practiceQuestionId && tests.length > 0;

  useEffect(() => { if (language === 'python') warmUpPython(); }, [language]);
  useEffect(() => { setResult(null); setUnavailable(null); setRunError(''); }, [question.questionId, language]);

  const run = async () => {
    setBusy('run'); setUnavailable(null); setRunError(''); setResult(null);
    try {
      if (BROWSER_LANGUAGES.includes(language)) {
        const local = await runInBrowser({
          language, source: code, tests, timeLimitMs: question.timeLimitMs,
          onStatus: (s) => setBusy(s === 'loading' ? 'loading' : 'run'),
        });
        if (local) { setResult(browserResult(local, tests)); return; }
      }
      setResult(await runQuestion(question.practiceQuestionId, { language, source: code }));
    } catch (e) {
      if (isUnavailable(e)) setUnavailable(e?.response?.data?.message || '');
      else setRunError(e?.response?.status === 429 ? 'Too many runs, wait a minute and try again.' : errorMessage(e, 'Your code could not be run'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 space-y-4 min-w-0">
      <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
        <Code className="w-5 h-5 text-primary-600" aria-hidden="true" />
        Your code
      </h3>
      {question.statement && <Markdown text={question.statement} />}
      {tests.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink">Examples</h4>
          {tests.map((t, i) => (
            <div key={t.id || i} className="grid gap-2 text-xs sm:grid-cols-2">
              <div><div className="mb-1 font-medium text-ink-muted">Input</div><pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-sand p-3 text-ink">{t.input || '(empty)'}</pre></div>
              <div><div className="mb-1 font-medium text-ink-muted">Output</div><pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-sand p-3 text-ink">{t.expectedOutput}</pre></div>
            </div>
          ))}
          {question.hiddenTestCount > 0 && <p className="text-xs text-ink-muted">Your answer is also checked against {question.hiddenTestCount} hidden tests when you submit.</p>}
        </div>
      )}
      <CodeEditor
        value={code}
        onChange={onCode}
        language={language}
        languages={question.languages}
        onLanguageChange={onLanguage}
        height="320px"
        ariaLabel="Your code"
      />
      {canRun ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon={<Terminal size={14} aria-hidden="true" />} disabled={!!busy || !code.trim()} loading={!!busy} onClick={run}>
            {busy === 'loading' ? 'Loading Python...' : busy ? 'Running...' : 'Run on the examples'}
          </Button>
          <span className="text-xs text-ink-muted">Running is not scored. Submit when you are ready.</span>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Your code is run on the server when you submit.</p>
      )}
      {unavailable !== null && <UnavailableNotice message={unavailable} />}
      {runError && <p role="alert" className="text-sm text-danger-700">{runError}</p>}
      {result && <ResultView result={result} />}
    </div>
  );
};

export default CodingAnswer;
