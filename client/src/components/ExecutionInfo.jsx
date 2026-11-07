import React from 'react';
import VerdictBadge from './VerdictBadge';

// Server-recorded execution of an interview coding answer (never client supplied).
const ExecutionInfo = ({ execution, source }) => {
  if (!execution && !source) return null;
  if (execution?.unavailable || source === 'unavailable') {
    return (
      <p className="text-xs text-gray-600 bg-gray-100 border rounded p-2 mb-2" role="status">
        Code execution was unavailable, so this answer was reviewed without running your code.
      </p>
    );
  }
  if (!execution) return null;
  return (
    <div className="text-xs text-gray-700 bg-gray-50 border rounded p-2 mb-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Server run</span>
        <VerdictBadge verdict={execution.verdict} size="sm" />
        {execution.testsTotal != null && <span>{execution.testsPassed}/{execution.testsTotal} tests passed</span>}
      </div>
      {execution.output && <pre className="whitespace-pre-wrap max-h-24 overflow-auto">{execution.output}</pre>}
      {execution.error && <pre className="whitespace-pre-wrap max-h-24 overflow-auto text-red-700">{execution.error}</pre>}
    </div>
  );
};

export default ExecutionInfo;
