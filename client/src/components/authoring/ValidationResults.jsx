import React from 'react';
import VerdictBadge from '../VerdictBadge';

const Table = ({ title, rows, expectPass }) => (
  <div>
    <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">{title}</h4>
    <ul className="space-y-1.5">
      {rows.map((t) => {
        const good = expectPass ? t.passed : !t.passed;
        return (
          <li key={t.index} className={`flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-xs ${t.passed ? 'bg-success-50' : 'bg-danger-50'}`}>
            <span className="font-semibold text-ink">Test {t.index}{t.visible ? '' : ' (hidden)'}</span>
            <span className={`font-medium ${t.passed ? 'text-success-700' : 'text-danger-700'}`}>{t.passed ? 'passed' : 'failed'}</span>
            {!t.passed && <VerdictBadge verdict={t.verdict} size="sm" />}
            {t.timeMs != null && <span className="text-ink-2">{t.timeMs} ms</span>}
            {!good && <span className="font-medium text-sun-700">not what validation expects</span>}
            {t.stderr ? <pre className="w-full overflow-x-auto whitespace-pre-wrap text-ink-2">{t.stderr}</pre> : null}
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
      <p className={`font-display text-lg font-semibold ${result.passed ? 'text-success-700' : 'text-danger-700'}`}>
        {result.passed ? 'Validation passed' : 'Validation failed'}
      </p>
      {result.message && <p className="text-sm text-ink-2">{result.message}</p>}
      {result.reference?.length > 0 && <Table title="Reference solution (all tests must pass)" rows={result.reference} expectPass />}
      {result.wrong?.length > 0 && <Table title="Wrong solution (at least one test must fail)" rows={result.wrong} expectPass={false} />}
    </div>
  );
};

export default ValidationResults;
