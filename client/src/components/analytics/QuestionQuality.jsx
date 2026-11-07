import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Repeat } from 'lucide-react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import InsufficientData from './InsufficientData';
import ExcludedNote from './ExcludedNote';

const Flag = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1 text-xs rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5">
    <Icon size={12} aria-hidden="true" /> {children}
  </span>
);

const num = (v, suffix = '') => (v === null || v === undefined ? 'n/a' : `${v}${suffix}`);

const QuestionQuality = ({ courseId, cohortId }) => {
  const [exposure, setExposure] = useState(90);
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.questionQuality(courseId, cohortId, exposure), `${courseId}|${cohortId}|${exposure}`);

  return (
    <section className="space-y-4" aria-labelledby="qq-h">
      <div>
        <h2 id="qq-h" className="text-lg font-semibold text-gray-800">Which questions to fix</h2>
        <p className="text-sm text-gray-500">
          Flags are prompts to review a question, not verdicts. Discrimination compares pass rates of the strongest and weakest quarter of students
          (measured on their other questions).
        </p>
      </div>
      <label className="text-xs text-gray-600 block">
        <span className="block mb-1">Over-exposed when at least this % of the scope attempted it</span>
        <input type="number" min="1" max="100" value={exposure}
          onChange={(e) => setExposure(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 90)))}
          className="w-24 bg-gray-100 rounded-md px-2 py-1 text-sm" />
      </label>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <ExcludedNote excluded={data.excluded} />
          {!data.questions?.length && <EmptyState title="No attempted questions yet" />}
          {data.questions?.map((q) => {
            const flagged = q.flags?.maybeBadlyWorded || q.flags?.lowDiscrimination || q.usage?.overExposed;
            return (
              <article key={q.questionId} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold text-gray-800">{q.title}</h3>
                  <span className="text-xs text-gray-500">
                    {[q.difficulty, ...(q.topic || [])].filter(Boolean).join(' | ')}
                  </span>
                </div>
                {q.insufficientData ? (
                  <InsufficientData n={q.n} minimum={q.minimum} notice={q.notice} />
                ) : (
                  <>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                      <div><dt className="text-xs text-gray-500">Pass rate</dt><dd>{num(q.passRatePercent, '%')} of {q.students} students</dd></div>
                      <div><dt className="text-xs text-gray-500">Discrimination (D)</dt><dd>{num(q.discriminationIndex)} ({q.rankedStudents} ranked)</dd></div>
                      <div><dt className="text-xs text-gray-500">Top / bottom quarter pass</dt>
                        <dd>{num(q.topQuartilePassRate)} / {num(q.bottomQuartilePassRate)}</dd></div>
                      <div><dt className="text-xs text-gray-500">Median minutes to solve</dt><dd>{num(q.medianMinutesToSolve)} ({q.solvers} solvers)</dd></div>
                    </dl>
                    <p className="text-xs text-gray-500">
                      Exposure: {q.usage?.studentsAttempted} of {q.usage?.studentsInScope} students ({num(q.usage?.percentOfScope, '%')}) attempted it.
                    </p>
                    {flagged && (
                      <div className="flex flex-wrap items-center gap-2">
                        {q.flags?.maybeBadlyWorded && <Flag icon={AlertTriangle}>Maybe badly worded: strong students also fail</Flag>}
                        {q.flags?.lowDiscrimination && <Flag icon={AlertTriangle}>Low discrimination (D under 0.1)</Flag>}
                        {q.usage?.overExposed && <Flag icon={Repeat}>Over-exposed: consider rotating it</Flag>}
                        <Link to={`/questions/${q.questionId}`} className="text-sm text-indigo-700 underline">
                          Suggest edit: open in the question editor
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </>
      )}
    </section>
  );
};

export default QuestionQuality;
