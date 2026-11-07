import React from 'react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { BarList, Heatmap } from './Charts';
import { ErrorState, LoadingState, EmptyState } from './EmptyState';
import ExcludedNote from './ExcludedNote';

const TopicHeatmap = ({ courseId, cohortId }) => {
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.topicHeatmap(courseId, cohortId), `${courseId}|${cohortId}`);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const columns = data.columns || [];
  const rows = data.rows || [];

  return (
    <section className="space-y-5" aria-labelledby="th-h">
      <div>
        <h2 id="th-h" className="font-display text-xl font-semibold text-ink">Which topics are weak, and for whom</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Each cell is the student&apos;s best eligible score per question, averaged over the topic. Use it to choose a topic to revisit,
          not to rank students. Rows and columns are ordered by data, nothing is scored or flagged.
        </p>
      </div>
      <ExcludedNote excluded={data.excluded} />
      {!columns.length ? (
        <EmptyState title="No topic data yet">Students need eligible scores on tagged questions.</EmptyState>
      ) : (
        <>
          <BarList
            caption="Share of students below 50 on each topic"
            items={columns.map((c) => ({
              label: c.topic, value: c.belowFiftyPercent,
              detail: `${c.studentsWithData} of ${c.studentsTotal} students have data, mean ${c.mean ?? 'n/a'}`,
            }))}
          />
          <Heatmap
            caption="Students by topic, best score"
            columns={columns}
            rows={rows.map((r) => ({ id: r.studentId, name: r.name, values: r.values }))}
          />
        </>
      )}
    </section>
  );
};

export default TopicHeatmap;
