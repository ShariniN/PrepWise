import React from 'react';
import VerdictBadge from './VerdictBadge';

const Block = ({ label, text }) => (
  <div>
    <div className="text-xs font-medium text-ink-muted">{label}</div>
    <pre className="bg-sand border border-line rounded-xl p-2 text-xs text-ink whitespace-pre-wrap break-words max-h-40 overflow-auto">{text === '' ? '(empty)' : text}</pre>
  </div>
);

// Per-test results. Visible tests show input/expected/actual; hidden tests only pass/fail.
const TestPanel = ({ tests = [] }) => {
  if (!tests.length) return null;
  return (
    <ul className="space-y-2">
      {tests.map((t) => (
        <li key={t.index} className={`border rounded-2xl p-3 ${t.passed ? 'border-success-100 bg-success-100/50' : 'border-danger-100 bg-danger-100/50'}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-ink">{t.visible ? `Test ${t.index}` : `Hidden test ${t.index}`}</span>
            <span className={t.passed ? 'text-success-700 font-semibold' : 'text-danger-700 font-semibold'}>{t.passed ? 'Passed' : 'Failed'}</span>
            {!t.passed && t.verdict && t.verdict !== 'wrong_answer' && <VerdictBadge verdict={t.verdict} size="sm" />}
            {t.timeMs != null && <span className="text-xs text-ink-muted">{t.timeMs} ms</span>}
            {t.memoryKb != null && <span className="text-xs text-ink-muted">{t.memoryKb} KB</span>}
          </div>
          {t.visible && (!t.passed || t.input !== undefined) && (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Block label="Input" text={t.input ?? ''} />
              <Block label="Expected" text={t.expectedOutput ?? ''} />
              <Block label="Actual" text={t.actualOutput ?? ''} />
              {t.error && <div className="sm:col-span-3"><Block label="Error" text={t.error} /></div>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

export default TestPanel;
