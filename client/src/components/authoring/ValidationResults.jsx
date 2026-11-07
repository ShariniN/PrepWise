import React from 'react';
import VerdictBadge from '../VerdictBadge';

const Table = ({ title, rows, expectPass }) => (
  <div>
    <h4 className="text-xs font-semibold text-gray-700 mb-1">{title}</h4>
    <ul className="space-y-1">
      {rows.map((t) => {
        const good = expectPass ? t.passed : !t.passed;
        return (
          <li key={t.index} className={`flex flex-wrap items-center gap-2 text-xs rounded px-2 py-1 ${t.passed ? 'bg-green-50' : 'bg-red-50'}`}>
            <span className="font-medium">Test {t.index}{t.visible ? '' : ' (hidden)'}</span>
            <span className={t.passed ? 'text-green-700' : 'text-red-700'}>{t.passed ? 'passed' : 'failed'}</span>
            {!t.passed && <VerdictBadge verdict={t.verdict} size="sm" />}
            {t.timeMs != null && <span className="text-gray-500">{t.timeMs} ms</span>}
            {!good && <span className="text-amber-700">not what validation expects</span>}
            {t.stderr ? <pre className="w-full whitespace-pre-wrap text-gray-600">{t.stderr}</pre> : null}
          </li>
        );
      })}
    </ul>
  </div>
);

const ValidationResults = ({ result }) => {
  if (!result) return null;
  return (
    <div className="space-y-3" aria-live="polite">
      <p className={`text-sm font-semibold ${result.passed ? 'text-green-700' : 'text-red-700'}`}>
        {result.passed ? 'Validation passed' : 'Validation failed'}
      </p>
      {result.message && <p className="text-sm text-gray-700">{result.message}</p>}
      {result.reference?.length > 0 && <Table title="Reference solution (all tests must pass)" rows={result.reference} expectPass />}
      {result.wrong?.length > 0 && <Table title="Wrong solution (at least one test must fail)" rows={result.wrong} expectPass={false} />}
    </div>
  );
};

export default ValidationResults;
