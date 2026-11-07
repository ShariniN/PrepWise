import React from 'react';
import VerdictBadge from './VerdictBadge';
import TestPanel from './TestPanel';

const Out = ({ label, text }) =>
  text ? (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">{text}</pre>
    </div>
  ) : null;

// Shows the outcome of a run or a submit.
const ResultView = ({ result }) => {
  if (!result) return null;
  const { verdict, mode, tests, score, passed, total, stdout, stderr, compileOutput, timeMs, memoryKb, explanation, message } = result;
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={verdict} />
        {mode === 'visible_tests' && <span className="text-xs text-gray-500">Visible tests only, not scored</span>}
        {mode === 'custom' && <span className="text-xs text-gray-500">Custom input, not scored</span>}
        {typeof score === 'number' && <span className="text-sm font-semibold text-gray-800">Score {score}/100</span>}
        {total != null && <span className="text-sm text-gray-600">{passed}/{total} tests passed</span>}
        {timeMs != null && <span className="text-xs text-gray-500">{timeMs} ms</span>}
        {memoryKb != null && <span className="text-xs text-gray-500">{memoryKb} KB</span>}
      </div>
      {message && <p className="text-sm text-gray-700">{message}</p>}
      {explanation && <p className="text-sm text-gray-700"><span className="font-semibold">Explanation: </span>{explanation}</p>}
      <Out label="Compile output" text={compileOutput} />
      <Out label="Standard output" text={stdout} />
      <Out label="Standard error" text={stderr} />
      <TestPanel tests={tests} />
    </div>
  );
};

export default ResultView;
