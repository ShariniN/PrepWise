import React, { useState } from 'react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import ExcludedNote from './ExcludedNote';

const DEFAULTS = { inactiveDays: 14, declineWindow: 3, declineMin: 10, compileErrors: 3, compileWindow: 5 };
const FIELDS = [
  { key: 'inactiveDays', label: 'Inactive days' },
  { key: 'declineWindow', label: 'Decline window (attempts)' },
  { key: 'declineMin', label: 'Minimum drop (points)' },
  { key: 'compileErrors', label: 'Compile errors' },
  { key: 'compileWindow', label: 'Out of last (submissions)' },
];

const inputCls = 'w-24 bg-gray-100 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

const StudentsNeedingHelp = ({ courseId, cohortId }) => {
  const [draft, setDraft] = useState(DEFAULTS);
  const [applied, setApplied] = useState(DEFAULTS);
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.studentsNeedingHelp(courseId, cohortId, applied), `${courseId}|${cohortId}|${JSON.stringify(applied)}`);

  const apply = (e) => {
    e.preventDefault();
    const next = {};
    FIELDS.forEach(({ key }) => { next[key] = Math.max(1, parseInt(draft[key], 10) || DEFAULTS[key]); });
    setApplied(next);
  };

  return (
    <section className="space-y-4" aria-labelledby="sn-h">
      <div>
        <h2 id="sn-h" className="text-lg font-semibold text-gray-800">Who to contact</h2>
        <p className="text-sm text-gray-500">
          Students with at least one reason to check in. There is no score and no ranking: the list is alphabetical and
          each chip says why the student appears.
        </p>
      </div>

      <form onSubmit={apply} className="flex flex-wrap gap-3 items-end rounded-xl border border-gray-200 bg-white p-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-gray-600">
            <span className="block mb-1">{f.label}</span>
            <input type="number" min="1" className={inputCls} value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
          </label>
        ))}
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md px-3 py-2">Apply thresholds</button>
        <button type="button" className="text-sm underline text-gray-600"
          onClick={() => { setDraft(DEFAULTS); setApplied(DEFAULTS); }}>Reset</button>
      </form>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <ExcludedNote excluded={data.excluded} note={data.note} />
          {!data.students?.length ? (
            <EmptyState title="No one to contact right now">No student matches the thresholds above.</EmptyState>
          ) : (
            <>
              <p className="text-sm text-gray-600">{data.students.length} student{data.students.length === 1 ? '' : 's'} listed, alphabetically.</p>
              <ul className="space-y-2">
                {data.students.map((s) => (
                  <li key={s.studentId} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold text-gray-800">{s.name}</span>
                      <a href={`mailto:${s.email}`} className="text-sm text-indigo-700 underline">{s.email}</a>
                    </div>
                    <ul className="flex flex-wrap gap-2 mt-2">
                      {s.reasons.map((r, i) => (
                        <li key={`${r.code}-${i}`} className="text-xs rounded-full bg-indigo-50 text-indigo-900 border border-indigo-100 px-2.5 py-1"
                          title={r.scores ? `Scores: ${r.scores.join(', ')}` : undefined}>
                          {r.message}
                          {r.code === 'declining_topic' && r.scores ? ` (${r.scores.join(' > ')})` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
};

export default StudentsNeedingHelp;
