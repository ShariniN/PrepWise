import React, { useState } from 'react';
import { lecturer } from '../../api/analytics';
import useAnalyticsData from '../../hooks/useAnalyticsData';
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
    <section className="space-y-4" aria-labelledby="ac-h">
      <div className="flex flex-wrap justify-between gap-3 items-end">
        <div>
          <h2 id="ac-h" className="text-lg font-semibold text-gray-800">Is the class practising?</h2>
          <p className="text-sm text-gray-500">Runs and submissions per UTC day (drafts are not counted). Use it to time a nudge.</p>
        </div>
        <label className="text-sm text-gray-600">
          <span className="block mb-1">Period</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-gray-100 rounded-md px-3 py-2 text-sm">
            {[7, 14, 30, 90, 180].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </label>
      </div>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
