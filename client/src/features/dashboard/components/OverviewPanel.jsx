import React from 'react';
import { BarList } from '../../../components/Charts';
import { Card, CardTitle, Skeleton } from '../../../components/ui';
import MetricTile from './MetricTile';
import { LEVEL_LABELS } from '../utils';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const OverviewSkeleton = () => (
  <div role="status" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 w-full" rounded="rounded-3xl" />)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-48 w-full" rounded="rounded-3xl" />
      <Skeleton className="h-48 w-full" rounded="rounded-3xl" />
    </div>
    <span className="sr-only">Loading the overview...</span>
  </div>
);

// Overview header of the dashboard: activity, CV and interview averages, next interview level, missing skills,
// and for admins the seat usage of the whole university.
const OverviewPanel = ({ data }) => {
  const levels = data.levelReachedCounts || { easy: 0, medium: 0, hard: 0 };
  const levelTotal = levels.easy + levels.medium + levels.hard;
  const seats = data.seats;

  return (
    <div className="space-y-5">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile label="Students" value={data.students} />
        <MetricTile label="Active, last 14 days" value={data.activeLast14Days} />
        <MetricTile label="Average CV score" value={data.avgCvScore} suffix="%"
          hint={`Against the target role, ${plural(data.studentsWithCvScore, 'student')}`} />
        <MetricTile label="Average interview score" value={data.avgInterviewScore}
          hint={`Latest interview, ${plural(data.studentsWithInterviewScore, 'student')}`} />
        <MetricTile label="Practice solved" value={data.practiceSolved} hint="Questions solved, all students" />
        <MetricTile label="To follow up" value={data.needingAttention} hint="Students with at least one flag" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card as="section" aria-labelledby="ov-level" className="space-y-4">
          <CardTitle className="!mb-0"><span id="ov-level">Next interview level</span></CardTitle>
          {levelTotal ? (
            <BarList
              caption="Students by the level their next interview starts at"
              suffix=""
              max={levelTotal}
              items={Object.keys(LEVEL_LABELS).map((k) => ({ label: LEVEL_LABELS[k], value: levels[k] }))}
            />
          ) : <p className="text-sm text-ink-2">No interview has a level yet.</p>}
        </Card>

        <Card as="section" aria-labelledby="ov-skills" className="space-y-3">
          <CardTitle className="!mb-0"><span id="ov-skills">Skills most often missing from CVs</span></CardTitle>
          {data.topMissingSkills === null || data.topMissingSkills === undefined ? (
            <p className="text-sm text-ink-2">Not enough data: shown once at least {data.minimumForSkills || 5} students have a CV score.</p>
          ) : data.topMissingSkills.length ? (
            <>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {data.topMissingSkills.map((s) => (
                  <li key={s.skill} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink">
                    {s.skill}
                    <span className="rounded-full bg-sand px-1.5 text-xs font-semibold text-ink-2" aria-label={`${s.students} students`}>{s.students}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-2">Number = students whose CV misses the skill for their target role.</p>
            </>
          ) : <p className="text-sm text-ink-2">No missing skills recorded yet.</p>}
        </Card>
      </div>

      {seats && (
        <Card as="section" aria-labelledby="ov-seats" className="space-y-3">
          <CardTitle className="!mb-0"><span id="ov-seats">Student seats</span></CardTitle>
          <BarList
            caption="Seats used across the university (active and invited students)"
            suffix=""
            max={Math.max(seats.limit, seats.used, 1)}
            items={[{ label: 'Seats used', value: seats.used, detail: `limit ${seats.limit}, ${seats.invited} invited` }]}
          />
        </Card>
      )}
    </div>
  );
};

export default OverviewPanel;
