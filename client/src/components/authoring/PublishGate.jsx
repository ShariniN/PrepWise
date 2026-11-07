import React from 'react';
import { isCodeType } from '../../utils/practice';
import { publishBlockers } from '../../utils/questionForm';

const MOVES = {
  draft: ['in_review', 'published'],
  in_review: ['draft', 'published'],
  published: ['retired', 'draft'],
  retired: ['draft'],
};
const LABEL = { draft: 'Back to draft', in_review: 'Send to review', published: 'Publish', retired: 'Retire' };

const PublishGate = ({ question, dirty, busy, onStatus, onValidate, canValidate }) => {
  const blockers = publishBlockers(question, dirty);
  const moves = MOVES[question.status] || [];
  const v = question.validation;
  return (
    <section className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 space-y-3" aria-label="Publish gate">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-gray-800">Publish gate</h3>
        <span className="text-xs rounded-full bg-white border px-2 py-0.5">Status: {question.status.replace('_', ' ')}</span>
        <span className="text-xs text-gray-500">Version {question.version}</span>
      </div>
      {isCodeType(question.type) && (
        <p className="text-sm">
          Validation: {!v ? <span className="text-gray-600">never run</span>
            : v.current && v.passed ? <span className="text-green-700 font-medium">passed for the current content ({v.testsRun} tests)</span>
            : !v.current ? <span className="text-amber-700 font-medium">out of date</span>
            : <span className="text-red-700 font-medium">failed</span>}
        </p>
      )}
      {blockers.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-amber-800" role="status">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      ) : <p className="text-sm text-green-700">Ready to publish.</p>}
      <div className="flex flex-wrap gap-2">
        {isCodeType(question.type) && (
          <button type="button" disabled={busy || !canValidate} onClick={onValidate}
            className="px-3 py-2 text-sm rounded-lg bg-white border border-indigo-300 text-indigo-800 disabled:opacity-50">
            {busy === 'validate' ? 'Validating...' : 'Validate in sandbox'}
          </button>
        )}
        {moves.map((s) => {
          const blocked = s === 'published' && blockers.length > 0;
          return (
            <button key={s} type="button" disabled={!!busy || blocked || !question.editable}
              title={blocked ? blockers[0] : undefined} onClick={() => onStatus(s)}
              className={`px-3 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${s === 'published' ? 'bg-green-600 text-white' : 'bg-white border border-gray-300'}`}>
              {LABEL[s]}
            </button>
          );
        })}
      </div>
      {question.status === 'published' && <p className="text-xs text-gray-500">Editing a published question moves it back to draft until it is validated and published again.</p>}
    </section>
  );
};

export default PublishGate;
