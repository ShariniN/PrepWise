import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'react-toastify';
import AppShell from '../components/AppShell';
import { Button, Card, Field, Table, THead, TBody, Tr, Th, Td } from '../components/ui';
import CourseCohortPicker from '../components/analytics/CourseCohortPicker';
import { BarList } from '../components/analytics/Charts';
import { EmptyState, ErrorState, LoadingState } from '../components/analytics/EmptyState';
import ExcludedNote from '../components/analytics/ExcludedNote';
import InsufficientData from '../components/analytics/InsufficientData';
import StatCard from '../components/analytics/StatCard';
import useAnalyticsData from '../hooks/useAnalyticsData';
import { careers, saveBlob } from '../api/analytics';
import { errorMessage } from '../api/client';

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v}%`);

const SkillsGap = ({ scope }) => {
  const [threshold, setThreshold] = useState(5);
  const { data, error, loading, reload } = useAnalyticsData(
    () => careers.skillsGap(scope, threshold), `${scope.courseId}|${scope.cohortId}|${threshold}`);
  return (
    <Card as="section" className="space-y-4" aria-labelledby="sg-h">
      <div>
        <h2 id="sg-h" className="font-display text-xl font-semibold text-ink">Which skills to build workshops for</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Self-reported proficiency (1 to 10) from students&apos; latest CV skills analysis. A skill appears only when at least 5 students have it.
        </p>
      </div>
      <Field label={`Gap threshold: mean below ${threshold}`} className="max-w-sm">
        {(p) => <input id={p.id} type="range" min="1" max="10" value={threshold} className="w-full accent-primary-600" onChange={(e) => setThreshold(Number(e.target.value))} />}
      </Field>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data?.insufficientData && <InsufficientData n={data.n} minimum={data.minimum} notice={data.notice} />}
      {data && !data.insufficientData && (
        <>
          <p className="text-xs text-ink-2">{data.students} students assessed. {data.note}</p>
          {!data.gaps?.length ? (
            <EmptyState title="No skill gaps at this threshold" />
          ) : (
            <BarList caption={`Skills with mean proficiency below ${data.threshold} (out of 10)`} suffix="" max={10}
              items={data.gaps.map((g) => ({ label: `${g.skill} (${g.category})`, value: g.meanProficiency, detail: `${g.students} students` }))} />
          )}
        </>
      )}
    </Card>
  );
};

const CohortBlock = ({ programme, cohort }) => {
  const [open, setOpen] = useState(false);
  const mean = cohort.meanInterviewAverages;
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <h4 className="font-display text-base font-semibold text-ink">{programme.code} / {cohort.name} <span className="text-sm font-normal text-ink-2">({cohort.studentCount} students)</span></h4>
      <BarList caption="Share of the cohort with each readiness step"
        items={[
          { label: 'CV analysed', value: cohort.withCvAnalysisPercent },
          { label: 'Mock interview done', value: cohort.withMockInterviewPercent },
          { label: 'Both', value: cohort.withBothPercent },
          { label: 'Solved a practice question', value: cohort.withPracticeSolvedPercent },
        ]} />
      {mean && (
        <p className="text-xs text-ink-2">
          Mean interview scores (0-100, scored interviews only): behavioural {mean.behavioralSkills ?? 'n/a'}, technical {mean.technicalKnowledge ?? 'n/a'},
          coding {mean.codingAbility ?? 'n/a'}, communication {mean.communication ?? 'n/a'}.
        </p>
      )}
      <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide students' : `Show ${cohort.students?.length || 0} students (who is ready for what)`}
      </Button>
      {open && (
          <Table className="!shadow-none">
            <caption className="sr-only">Students in {cohort.name}, listed alphabetically</caption>
            <THead>
              <Tr>
                <Th>Student</Th><Th>CV analyses</Th><Th>Interviews (scored / completed)</Th><Th>Practice solved</Th>
                <Th>Behav.</Th><Th>Tech.</Th><Th>Coding</Th><Th>Comm.</Th>
              </Tr>
            </THead>
            <TBody>
              {cohort.students.map((s) => (
                <Tr key={s.studentId}>
                  <Td className="whitespace-nowrap">{s.name}<br /><span className="text-ink-2">{s.email}</span></Td>
                  <Td>{s.cvAnalyses}</Td><Td>{s.mockInterviewsScored} / {s.mockInterviewsCompleted}</Td><Td>{s.practiceSolved}</Td>
                  <Td>{s.interviewAverages?.behavioralSkills ?? '-'}</Td><Td>{s.interviewAverages?.technicalKnowledge ?? '-'}</Td>
                  <Td>{s.interviewAverages?.codingAbility ?? '-'}</Td><Td>{s.interviewAverages?.communication ?? '-'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
      )}
    </div>
  );
};

const CareerReadiness = () => {
  const [scope, setScope] = useState({ courseId: '', cohortId: '' });
  const [exporting, setExporting] = useState(false);
  const key = `${scope.courseId}|${scope.cohortId}`;
  const readiness = useAnalyticsData(() => careers.readiness(scope), key);
  const coverage = useAnalyticsData(() => careers.coverage(scope), key);

  const download = async () => {
    setExporting(true);
    try {
      saveBlob(await careers.readinessCsv(scope), 'readiness.csv');
      toast.success('Download started. This export has been recorded in the audit log.');
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'));
    } finally { setExporting(false); }
  };

  const inst = coverage.data?.institution;
  const { data, error, loading, reload } = readiness;

  return (
    <AppShell
      title="Career readiness: who is ready for what"
      subtitle="By programme and cohort. No CV text, interview answers or source code are shown here."
    >
      <div className="space-y-6">
        <Card tone="sand" className="space-y-4">
          <CourseCohortPicker value={scope} onChange={setScope} includeAllCourses />
          <div>
            <Button variant="dark" loading={exporting} onClick={download} icon={<Download size={16} aria-hidden="true" />}>
              {exporting ? 'Preparing...' : 'Download readiness CSV'}
            </Button>
            <p className="mt-2 text-xs text-ink-2">The export contains student names and emails. Every download is recorded in the audit log.</p>
          </div>
        </Card>

        {inst && (
          <section aria-label="Institution coverage" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Students" value={inst.students} />
            <StatCard label="CV analysed" value={pct(inst.withCvAnalysisPercent)} />
            <StatCard label="Mock interview" value={pct(inst.withMockInterviewPercent)} />
            <StatCard label="Both" value={pct(inst.withBothPercent)} />
            <StatCard label="Practice solved" value={pct(inst.withPracticeSolvedPercent)} />
          </section>
        )}
        {coverage.error && <ErrorState message={coverage.error} onRetry={coverage.reload} />}

        <Card as="section" className="space-y-5" aria-labelledby="rd-h">
          <h2 id="rd-h" className="font-display text-xl font-semibold text-ink">Readiness by programme and cohort</h2>
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {data && (
            <>
              <ExcludedNote excluded={data.excluded} note={data.note} />
              {data.excluded && (
                <p className="text-xs text-ink-2">
                  Fallback interviews: {data.excluded.fallbackInterviews}. Unconfirmed or fallback practice attempts: {data.excluded.unconfirmedOrFallbackAttempts}.
                </p>
              )}
              {!data.programmes?.length && <EmptyState title="No programmes in this scope" />}
              {data.programmes?.map((p) => (
                <div key={p.courseId} className="space-y-3">
                  <h3 className="font-display text-lg font-semibold text-ink">{p.code} - {p.title}</h3>
                  {p.cohorts.map((c) => <CohortBlock key={c.cohortId} programme={p} cohort={c} />)}
                </div>
              ))}
            </>
          )}
        </Card>

        <SkillsGap scope={scope} />
      </div>
    </AppShell>
  );
};

export default CareerReadiness;
