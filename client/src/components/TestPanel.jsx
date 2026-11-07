import React from 'react';
import VerdictBadge from './VerdictBadge';

const Block = ({ label, text }) => (
  <div>
    <div className="text-xs text-gray-500">{label}</div>
    <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto">{text === '' ? '(empty)' : text}</pre>
  </div>
);

// Per-test results. Visible tests show input/expected/actual; hidden tests only pass/fail.
const TestPanel = ({ tests = [] }) => {
  if (!tests.length) return null;
  return (
    <ul className="space-y-2">
      {tests.map((t) => (
        <li key={t.index} className={`border rounded p-2 ${t.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{t.visible ? `Test ${t.index}` : `Hidden test ${t.index}`}</span>
            <span className={t.passed ? 'text-green-700' : 'text-red-700'}>{t.passed ? 'Passed' : 'Failed'}</span>
            {!t.passed && t.verdict && t.verdict !== 'wrong_answer' && <VerdictBadge verdict={t.verdict} size="sm" />}
            {t.timeMs != null && <span className="text-xs text-gray-500">{t.timeMs} ms</span>}
            {t.memoryKb != null && <span className="text-xs text-gray-500">{t.memoryKb} KB</span>}
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
