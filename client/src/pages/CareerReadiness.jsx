import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'react-toastify';
import NavBar from '../components/NavBar';
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
    <section className="bg-white rounded-2xl shadow p-6 space-y-3" aria-labelledby="sg-h">
      <div>
        <h2 id="sg-h" className="text-lg font-semibold text-gray-800">Which skills to build workshops for</h2>
        <p className="text-sm text-gray-500">
          Self-reported proficiency (1 to 10) from students&apos; latest CV skills analysis. A skill appears only when at least 5 students have it.
        </p>
      </div>
      <label className="text-sm text-gray-600 block">
        <span className="block mb-1">Gap threshold: mean below {threshold}</span>
        <input type="range" min="1" max="10" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
      </label>
      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data?.insufficientData && <InsufficientData n={data.n} minimum={data.minimum} notice={data.notice} />}
      {data && !data.insufficientData && (
        <>
          <p className="text-xs text-gray-500">{data.students} students assessed. {data.note}</p>
          {!data.gaps?.length ? (
            <EmptyState title="No skill gaps at this threshold" />
          ) : (
            <BarList caption={`Skills with mean proficiency below ${data.threshold} (out of 10)`} suffix="" max={10}
              items={data.gaps.map((g) => ({ label: `${g.skill} (${g.category})`, value: g.meanProficiency, detail: `${g.students} students` }))} />
          )}
        </>
      )}
    </section>
  );
};

const CohortBlock = ({ programme, cohort }) => {
  const [open, setOpen] = useState(false);
  const mean = cohort.meanInterviewAverages;
  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <h4 className="font-semibold text-gray-800">{programme.code} / {cohort.name} <span className="text-sm font-normal text-gray-500">({cohort.studentCount} students)</span></h4>
      <BarList caption="Share of the cohort with each readiness step"
        items={[
          { label: 'CV analysed', value: cohort.withCvAnalysisPercent },
          { label: 'Mock interview done', value: cohort.withMockInterviewPercent },
          { label: 'Both', value: cohort.withBothPercent },
          { label: 'Solved a practice question', value: cohort.withPracticeSolvedPercent },
        ]} />
      {mean && (
        <p className="text-xs text-gray-600">
          Mean interview scores (0-100, scored interviews only): behavioural {mean.behavioralSkills ?? 'n/a'}, technical {mean.technicalKnowledge ?? 'n/a'},
          coding {mean.codingAbility ?? 'n/a'}, communication {mean.communication ?? 'n/a'}.
        </p>
      )}
      <button type="button" className="text-sm text-indigo-700 underline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide students' : `Show ${cohort.students?.length || 0} students (who is ready for what)`}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Students in {cohort.name}, listed alphabetically</caption>
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1">Student</th><th>CV analyses</th><th>Interviews (scored / completed)</th><th>Practice solved</th>
                <th>Behav.</th><th>Tech.</th><th>Coding</th><th>Comm.</th>
              </tr>
            </thead>
            <tbody>
              {cohort.students.map((s) => (
                <tr key={s.studentId} className="border-t border-gray-100">
                  <td className="py-1">{s.name}<br /><span className="text-gray-500">{s.email}</span></td>
                  <td>{s.cvAnalyses}</td><td>{s.mockInterviewsScored} / {s.mockInterviewsCompleted}</td><td>{s.practiceSolved}</td>
                  <td>{s.interviewAverages?.behavioralSkills ?? '-'}</td><td>{s.interviewAverages?.technicalKnowledge ?? '-'}</td>
                  <td>{s.interviewAverages?.codingAbility ?? '-'}</td><td>{s.interviewAverages?.communication ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h1 className="text-2xl font-bold text-gray-800">Career readiness: who is ready for what</h1>
          <p className="text-sm text-gray-500">By programme and cohort. No CV text, interview answers or source code are shown here.</p>
          <CourseCohortPicker value={scope} onChange={setScope} includeAllCourses />
          <div>
            <button type="button" onClick={download} disabled={exporting}
              className="inline-flex items-center gap-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 disabled:opacity-60">
              <Download size={14} aria-hidden="true" /> {exporting ? 'Preparing...' : 'Download readiness CSV'}
            </button>
            <p className="text-xs text-gray-500 mt-1">The export contains student names and emails. Every download is recorded in the audit log.</p>
          </div>
        </header>

        {inst && (
          <section aria-label="Institution coverage" className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Students" value={inst.students} />
            <StatCard label="CV analysed" value={pct(inst.withCvAnalysisPercent)} />
            <StatCard label="Mock interview" value={pct(inst.withMockInterviewPercent)} />
            <StatCard label="Both" value={pct(inst.withBothPercent)} />
            <StatCard label="Practice solved" value={pct(inst.withPracticeSolvedPercent)} />
          </section>
        )}
        {coverage.error && <ErrorState message={coverage.error} onRetry={coverage.reload} />}

        <section className="bg-white rounded-2xl shadow p-6 space-y-4" aria-labelledby="rd-h">
          <h2 id="rd-h" className="text-lg font-semibold text-gray-800">Readiness by programme and cohort</h2>
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {data && (
            <>
              <ExcludedNote excluded={data.excluded} note={data.note} />
              {data.excluded && (
                <p className="text-xs text-gray-500">
                  Fallback interviews: {data.excluded.fallbackInterviews}. Unconfirmed or fallback practice attempts: {data.excluded.unconfirmedOrFallbackAttempts}.
                </p>
              )}
              {!data.programmes?.length && <EmptyState title="No programmes in this scope" />}
              {data.programmes?.map((p) => (
                <div key={p.courseId} className="space-y-3">
                  <h3 className="font-semibold text-gray-700">{p.code} - {p.title}</h3>
                  {p.cohorts.map((c) => <CohortBlock key={c.cohortId} programme={p} cohort={c} />)}
                </div>
              ))}
            </>
          )}
        </section>

        <SkillsGap scope={scope} />
      </main>
    </div>
  );
};

export default CareerReadiness;
