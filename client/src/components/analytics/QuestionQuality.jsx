import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Repeat } from 'lucide-react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import InsufficientData from './InsufficientData';
import ExcludedNote from './ExcludedNote';
import { Badge, Card, Field, Input } from '../ui';

const Flag = ({ icon, children }) => (
  <Badge tone="warning" icon={icon} className="!whitespace-normal">{children}</Badge>
);

const num = (v, suffix = '') => (v === null || v === undefined ? 'n/a' : `${v}${suffix}`);

const QuestionQuality = ({ courseId, cohortId }) => {
  const [exposure, setExposure] = useState(90);
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.questionQuality(courseId, cohortId, exposure), `${courseId}|${cohortId}|${exposure}`);

  return (
    <section className="space-y-5" aria-labelledby="qq-h">
      <div>
        <h2 id="qq-h" className="font-display text-xl font-semibold text-ink">Which questions to fix</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Flags are prompts to review a question, not verdicts. Discrimination compares pass rates of the strongest and weakest quarter of students
          (measured on their other questions).
        </p>
      </div>
      <Field label="Over-exposed when at least this % of the scope attempted it" className="max-w-sm">
        {(p) => (
          <Input {...p} type="number" min="1" max="100" value={exposure}
            onChange={(e) => setExposure(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 90)))} />
        )}
      </Field>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <ExcludedNote excluded={data.excluded} />
          {!data.questions?.length && <EmptyState title="No attempted questions yet" />}
          {data.questions?.map((q) => {
            const flagged = q.flags?.maybeBadlyWorded || q.flags?.lowDiscrimination || q.usage?.overExposed;
            return (
              <Card as="article" tone="sand" key={q.questionId} className="space-y-3 !p-4 sm:!p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">{q.title}</h3>
                  <span className="text-xs text-ink-2">
                    {[q.difficulty, ...(q.topic || [])].filter(Boolean).join(' | ')}
                  </span>
                </div>
                {q.insufficientData ? (
                  <InsufficientData n={q.n} minimum={q.minimum} notice={q.notice} />
                ) : (
                  <>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                      <div><dt className="text-xs text-ink-2">Pass rate</dt><dd>{num(q.passRatePercent, '%')} of {q.students} students</dd></div>
                      <div><dt className="text-xs text-ink-2">Discrimination (D)</dt><dd>{num(q.discriminationIndex)} ({q.rankedStudents} ranked)</dd></div>
                      <div><dt className="text-xs text-ink-2">Top / bottom quarter pass</dt>
                        <dd>{num(q.topQuartilePassRate)} / {num(q.bottomQuartilePassRate)}</dd></div>
                      <div><dt className="text-xs text-ink-2">Median minutes to solve</dt><dd>{num(q.medianMinutesToSolve)} ({q.solvers} solvers)</dd></div>
                    </dl>
                    <p className="text-xs text-ink-2">
                      Exposure: {q.usage?.studentsAttempted} of {q.usage?.studentsInScope} students ({num(q.usage?.percentOfScope, '%')}) attempted it.
                    </p>
                    {flagged && (
                      <div className="flex flex-wrap items-center gap-2">
                        {q.flags?.maybeBadlyWorded && <Flag icon={<AlertTriangle size={12} aria-hidden="true" />}>Maybe badly worded: strong students also fail</Flag>}
                        {q.flags?.lowDiscrimination && <Flag icon={<AlertTriangle size={12} aria-hidden="true" />}>Low discrimination (D under 0.1)</Flag>}
                        {q.usage?.overExposed && <Flag icon={<Repeat size={12} aria-hidden="true" />}>Over-exposed: consider rotating it</Flag>}
                        <Link to={`/questions/${q.questionId}`} className="text-sm font-medium text-primary-700 underline underline-offset-2">
                          Suggest edit: open in the question editor
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </>
      )}
    </section>
  );
};

export default QuestionQuality;
