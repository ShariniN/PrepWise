import React from 'react';
import { EyeOff } from 'lucide-react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { BarList } from './Charts';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import InsufficientData from './InsufficientData';
import ExcludedNote from './ExcludedNote';
import { Badge, Card, Table, THead, TBody, Tr, Th, Td } from '../ui';

const VerdictLine = ({ verdicts }) => (
  <p className="text-xs text-ink-2">
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
    <section className="space-y-5" aria-labelledby="fp-h">
      <div>
        <h2 id="fp-h" className="font-display text-xl font-semibold text-ink">What to re-teach</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Coding and debug questions where the most students fail, using each student&apos;s latest submission.
          Class size in scope: {data.scope?.students ?? '?'}.
        </p>
      </div>
      <ExcludedNote excluded={data.excluded} note={data.note} />
      {!questions.length && <EmptyState title="No submissions yet">Nothing to re-teach until students submit code.</EmptyState>}
      {questions.map((q) => (
        <Card as="article" tone="sand" key={q.questionId} className="space-y-3 !p-4 sm:!p-5">
          <h3 className="font-display text-base font-semibold text-ink">{q.title}</h3>
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
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                    <EyeOff size={14} aria-hidden="true" /> Failing tests (staff only: hidden tests are shown here and never to students)
                  </p>
                  <Table className="!shadow-none">
                      <THead>
                        <Tr>
                          <Th>Test</Th><Th>Visibility</Th><Th>Failed by</Th><Th>Input</Th><Th>Expected output</Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {q.tests.map((t) => (
                          <Tr key={t.testId || t.index} className="align-top">
                            <Td>#{t.index}</Td>
                            <Td>
                              {t.visible ? 'Visible' : <Badge tone="dark">Hidden (staff only)</Badge>}
                            </Td>
                            <Td className="whitespace-nowrap">{t.failCount} ({t.failPercent}%)</Td>
                            <Td><code className="whitespace-pre-wrap break-all font-mono text-xs">{t.input}</code></Td>
                            <Td><code className="whitespace-pre-wrap break-all font-mono text-xs">{t.expectedOutput}</code></Td>
                          </Tr>
                        ))}
                      </TBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </Card>
      ))}
    </section>
  );
};

export default FailurePatterns;
