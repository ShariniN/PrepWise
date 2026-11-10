import React from 'react';
import { BarList } from '../analytics/Charts';
import { Card, CardTitle, Skeleton } from '../ui';
import MetricTile from './MetricTile';
import DeliverySummary from './DeliverySummary';
import { DataNotice, FootNote } from './Notice';
import { CATEGORIES } from '../../utils/lecturer';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const OverviewSkeleton = () => (
  <div role="status" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 w-full" rounded="rounded-3xl" />)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-64 w-full" rounded="rounded-3xl" />
      <Skeleton className="h-64 w-full" rounded="rounded-3xl" />
    </div>
    <span className="sr-only">Loading the overview...</span>
  </div>
);

// Overview header of the lecturer dashboard: totals, interview and CV averages, delivery.
const OverviewPanel = ({ data }) => {
  const { totals, interview, cv, delivery } = data;
  const catDetail = (m) => (m.average === null ? `n = ${m.n}, minimum ${interview.minimum}` : `n = ${m.n}`);

  return (
    <div className="space-y-5">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile label="Students" value={totals.students} />
        <MetricTile label="Did a mock interview" value={totals.withMockInterview} />
        <MetricTile label="Analysed a CV" value={totals.withCvAnalysis} />
        <MetricTile label="Active, last 7 days" value={totals.active7d} />
        <MetricTile label="Active, last 30 days" value={totals.active30d} />
        <MetricTile label="To follow up" value={totals.needingAttention} hint="Students with at least one reason" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card as="section" aria-labelledby="ov-int" className="space-y-4">
          <CardTitle className="!mb-0"><span id="ov-int">Mock interviews</span></CardTitle>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-sm font-medium text-ink-2">Average interview score</p>
              {interview.overall.average === null
                ? <p className="mt-1 font-display text-lg font-semibold text-ink-2">Not enough data</p>
                : <p className="font-display text-4xl font-semibold tracking-tight text-ink tabular-nums">{interview.overall.average}<span className="text-lg text-ink-2"> / 100</span></p>}
              <p className="text-xs text-ink-2">Mean of each student&apos;s average, n = {interview.overall.n} students</p>
            </div>
          </div>
          <DataNotice notice={interview.notice} />
          <BarList
            caption="Average score by category (0 to 100)"
            suffix=""
            empty="not enough data"
            items={CATEGORIES.map((c) => ({ label: c.label, value: interview[c.key].average, detail: catDetail(interview[c.key]) }))}
          />
          <FootNote>
            {plural(interview.excludedFallbackAnswers, 'answer')} scored by the basic fallback (AI unavailable) {interview.excludedFallbackAnswers === 1 ? 'is' : 'are'} not counted.
          </FootNote>
        </Card>

        <Card as="section" aria-labelledby="ov-cv" className="space-y-4">
          <CardTitle className="!mb-0"><span id="ov-cv">CVs</span></CardTitle>
          <div>
            <p className="text-sm font-medium text-ink-2">Average CV match</p>
            {cv.averageBestMatch.average === null
              ? <p className="mt-1 font-display text-lg font-semibold text-ink-2">Not enough data</p>
              : <p className="font-display text-4xl font-semibold tracking-tight text-ink tabular-nums">{cv.averageBestMatch.average}%</p>}
            <p className="text-xs text-ink-2">Best job match of each student&apos;s latest CV, n = {cv.averageBestMatch.n} students</p>
          </div>
          <DataNotice notice={cv.notice} />
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">Skills most often missing from CVs</h4>
            {cv.topMissingSkills.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {cv.topMissingSkills.map((s) => (
                  <li key={s.skill} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink">
                    {s.skill}
                    <span className="rounded-full bg-sand px-1.5 text-xs font-semibold text-ink-2" aria-label={`${s.students} students`}>{s.students}</span>
                  </li>
                ))}
              </ul>
            ) : cv.topMissingSkillsInsufficientData
              ? <p className="text-sm text-ink-2">Not enough data: shown once at least {cv.minimum || 5} students have analysed a CV.</p>
              : <p className="text-sm text-ink-2">No missing skills recorded yet.</p>}
            <p className="mt-2 text-xs text-ink-2">Number = students whose latest CV misses the skill for at least one job ({cv.studentsWithAnalysis} students analysed a CV).</p>
          </div>
          <FootNote>
            {plural(cv.excludedAiUnavailableResults, 'job result')} without an AI score {cv.excludedAiUnavailableResults === 1 ? 'is' : 'are'} not counted.
          </FootNote>
        </Card>
      </div>

      <Card as="section" aria-labelledby="ov-del" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="ov-del" className="font-display text-lg font-semibold text-ink">Interview delivery</h3>
          <p className="text-xs text-ink-2">{plural(delivery.n, 'student')}, {plural(delivery.answers, 'answer')} with delivery data</p>
        </div>
        <DataNotice notice={delivery.notice} />
        <DeliverySummary delivery={delivery} cohort />
        <FootNote>Camera figures use only answers recorded with the camera on. Older interviews have no delivery data.</FootNote>
      </Card>
    </div>
  );
};

export default OverviewPanel;
