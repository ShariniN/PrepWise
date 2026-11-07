import React, { useState } from 'react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
import { Field, Select } from '../ui';
import { Sparkline } from './Charts';
import { ErrorState, LoadingState } from './EmptyState';
import StatCard from './StatCard';

const ActivityTab = ({ courseId, cohortId }) => {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAnalyticsData(
    () => lecturer.activity(courseId, cohortId, days), `${courseId}|${cohortId}|${days}`);

  const daily = data?.daily || [];
  const sum = (k) => daily.reduce((a, d) => a + d[k], 0);

  return (
    <section className="space-y-5" aria-labelledby="ac-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="ac-h" className="font-display text-xl font-semibold text-ink">Is the class practising?</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-2">Runs and submissions per UTC day (drafts are not counted). Use it to time a nudge.</p>
        </div>
        <Field label="Period" className="w-full sm:w-48">
          {(p) => (
            <Select {...p} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 14, 30, 90, 180].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </Select>
          )}
        </Field>
      </div>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Runs and submissions" value={sum('attempts')} />
            <StatCard label="Submissions" value={sum('submissions')} />
            <StatCard label="Students in scope" value={data.scope?.students ?? '?'} />
          </div>
          <Sparkline caption="Attempts per day" points={daily.map((d) => ({ label: d.date, value: d.attempts }))} />
          <Sparkline caption="Active students per day" points={daily.map((d) => ({ label: d.date, value: d.activeStudents }))} />
        </>
      )}
    </section>
  );
};

export default ActivityTab;
