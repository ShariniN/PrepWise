import React from 'react';
import { EyeOff } from 'lucide-react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { BarList } from './Charts';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import InsufficientData from './InsufficientData';
import ExcludedNote from './ExcludedNote';

const VerdictLine = ({ verdicts }) => (
  <p className="text-xs text-gray-600">
    {Object.entries(verdicts || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' | ')}
  </p>
);

const FailurePatterns = ({ courseId, cohortId }) => {
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.failurePatterns(courseId, cohortId), `${courseId}|${cohortId}`);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const questions = data.questions || [];

  return (
    <section className="space-y-4" aria-labelledby="fp-h">
      <div>
        <h2 id="fp-h" className="text-lg font-semibold text-gray-800">What to re-teach</h2>
        <p className="text-sm text-gray-500">
          Coding and debug questions where the most students fail, using each student&apos;s latest submission.
          Class size in scope: {data.scope?.students ?? '?'}.
        </p>
      </div>
      <ExcludedNote excluded={data.excluded} note={data.note} />
      {!questions.length && <EmptyState title="No submissions yet">Nothing to re-teach until students submit code.</EmptyState>}
      {questions.map((q) => (
        <article key={q.questionId} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">{q.title}</h3>
          {q.insufficientData ? (
            <InsufficientData n={q.n} minimum={q.minimum} notice={q.notice} />
          ) : (
            <>
              <BarList
                caption={`${q.failingPercent}% of ${q.n} students fail this question (${q.failingStudents} students)`}
                items={[{ label: 'Failing students', value: q.failingPercent, detail: `${q.failingStudents} of ${q.n}` }]}
              />
              <VerdictLine verdicts={q.verdicts} />
              {q.tests?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <EyeOff size={14} aria-hidden="true" /> Failing tests (staff only: hidden tests are shown here and never to students)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs mt-1">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-1">Test</th><th>Visibility</th><th>Failed by</th><th>Input</th><th>Expected output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.tests.map((t) => (
                          <tr key={t.testId || t.index} className="border-t border-gray-100 align-top">
                            <td className="py-1">#{t.index}</td>
                            <td>
                              {t.visible ? 'Visible' : (
                                <span className="inline-block rounded bg-gray-800 text-white px-1.5 py-0.5">Hidden (staff only)</span>
                              )}
                            </td>
                            <td>{t.failCount} ({t.failPercent}%)</td>
                            <td><code className="whitespace-pre-wrap break-all">{t.input}</code></td>
                            <td><code className="whitespace-pre-wrap break-all">{t.expectedOutput}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
};

export default FailurePatterns;
