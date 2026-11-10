import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../components/AppShell';
import ScoreBreakdown from '../components/ScoreBreakdown';
import { Badge, Button, Card, CardTitle, EmptyState, Skeleton, Table, THead, TBody, Tr, Th, Td, Tabs, TabPanel } from '../components/ui';
import { ErrorState } from '../components/analytics/EmptyState';
import MetricTile from '../components/lecturer/MetricTile';
import AttentionChips from '../components/lecturer/AttentionChips';
import DeliverySummary from '../components/lecturer/DeliverySummary';
import { FootNote, PrivacyNote } from '../components/lecturer/Notice';
import useAnalyticsData from '../hooks/useAnalyticsData';
import { getStudent } from '../api/lecturer';
import { CATEGORIES, fmtDate, fmtLastActive, fmtNum } from '../utils/lecturer';

const STATUS_LABELS = { created: 'Not started', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_TONE = { completed: 'success', in_progress: 'primary', created: 'neutral', cancelled: 'neutral' };

const Interviews = ({ student, interviews, delivery, from }) => {
  const navigate = useNavigate();
  if (!interviews.length) return <EmptyState title="No mock interviews yet" description="Interviews appear here once the student starts one." className="!py-10" />;
  const open = (iv) => navigate(`/staff/students/${student.id}/interviews/${iv.id}`, { state: { from } });
  return (
    <div className="space-y-5">
      <Table className="!shadow-none">
        <caption className="sr-only">Mock interviews, newest first. Scores are 0 to 100.</caption>
        <THead>
          <Tr>
            <Th>Date</Th><Th>Role</Th><Th>Status</Th><Th className="text-right">Score</Th>
            {CATEGORIES.map((c) => <Th key={c.key} className="text-right">{c.label}</Th>)}
            <Th>Readiness</Th>
          </Tr>
        </THead>
        <TBody>
          {interviews.map((iv) => (
            <Tr key={iv.id} onClick={() => open(iv)} className="align-top">
              <Td className="whitespace-nowrap">
                <Link to={`/staff/students/${student.id}/interviews/${iv.id}`} state={{ from }} onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-ink hover:text-primary-700 hover:underline">
                  {fmtDate(iv.date)}
                </Link>
              </Td>
              <Td className="min-w-[16rem] max-w-md text-ink-2">{iv.jobExcerpt || '-'}</Td>
              <Td>
                <Badge tone={STATUS_TONE[iv.status] || 'neutral'}>{STATUS_LABELS[iv.status] || iv.status}</Badge>
                {iv.excludedFallbackAnswers > 0 && (
                  <span className="mt-1 block whitespace-nowrap text-xs text-ink-2">{iv.excludedFallbackAnswers} fallback not counted</span>
                )}
              </Td>
              <Td className="text-right font-semibold tabular-nums">{fmtNum(iv.score)}</Td>
              {CATEGORIES.map((c) => <Td key={c.key} className="text-right tabular-nums">{fmtNum(iv.categoryScores?.[c.key])}</Td>)}
              <Td className="whitespace-nowrap">{iv.readinessLevel || '-'}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card as="section" aria-labelledby="pd-h" className="space-y-3">
        <h3 id="pd-h" className="font-display text-lg font-semibold text-ink">Delivery across completed interviews</h3>
        {delivery?.hasData
          ? <DeliverySummary delivery={delivery} />
          : <p className="text-sm text-ink-2">No delivery data. The camera and voice measures are recorded only by newer interviews.</p>}
      </Card>
    </div>
  );
};

const List = ({ title, items }) => (
  <div>
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-2">{title}</p>
    {items?.length
      ? <ul className="ml-5 list-disc space-y-1 text-sm text-ink">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
      : <p className="text-sm text-ink-2">None recorded.</p>}
  </div>
);

const CvAnalyses = ({ analyses }) => {
  if (!analyses.length) return <EmptyState title="No CV analyses yet" description="Analyses appear here once the student checks a CV against a job." className="!py-10" />;
  return (
    <div className="space-y-5">
      {analyses.map((a) => (
        <Card key={a.id} as="article" className="space-y-4 !shadow-none">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">CV analysed {fmtDate(a.date)}</h3>
            <p className="text-sm text-ink-2">
              Best match <span className="font-semibold text-ink">{fmtNum(a.bestMatch, '%')}</span>
              {a.firstAnalysedAt && a.firstAnalysedAt !== a.date ? ` | first analysed ${fmtDate(a.firstAnalysedAt)}` : ''}
            </p>
          </div>
          {a.results.map((r, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-ink">{r.jobTitle || 'Job'}{r.company ? ` at ${r.company}` : ''}</h4>
                  {r.jobExcerpt && <p className="mt-0.5 text-sm text-ink-2">{r.jobExcerpt}</p>}
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-semibold text-ink tabular-nums">{fmtNum(r.matchPercentage, '%')}</p>
                  {!r.countsTowardAverage && (
                    <Badge tone="neutral">{r.isNonTechRole ? 'Non-tech job, not counted' : 'No AI score, not counted'}</Badge>
                  )}
                </div>
              </div>
              <ScoreBreakdown breakdown={r.scoreBreakdown} audience="lecturer" />
              <div className="grid gap-4 sm:grid-cols-2">
                <List title="Strengths" items={r.strengths} />
                <List title="Weaknesses" items={r.weaknesses} />
              </div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
};

const SkillRow = ({ s }) => (
  <li className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
    <span className="min-w-0 text-sm text-ink">{s.name}{s.category && <span className="text-ink-2"> ({s.category})</span>}</span>
    <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{s.proficiencyLevel}/10</span>
  </li>
);

const Skills = ({ skills }) => {
  if (!skills) return <EmptyState title="No skills self-assessment yet" description="The student has not rated their skills." className="!py-10" />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricTile label="Assessed" value={fmtDate(skills.assessedAt)} />
        <MetricTile label="Skills rated" value={skills.skillsRated} />
        <MetricTile label="Average self-rating" value={skills.averageProficiency} suffix=" / 10" className="col-span-2 md:col-span-1" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="!shadow-none"><CardTitle>Rated strongest</CardTitle><ul className="m-0 list-none p-0">{skills.strongest.map((s) => <SkillRow key={s.name} s={s} />)}</ul></Card>
        <Card className="!shadow-none"><CardTitle>Rated weakest</CardTitle><ul className="m-0 list-none p-0">{skills.weakest.map((s) => <SkillRow key={s.name} s={s} />)}</ul></Card>
      </div>
      <FootNote>Ratings are the student&apos;s own view of their proficiency (1 to 10), not a test result.</FootNote>
    </div>
  );
};

const Practice = ({ practice }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricTile label="Submissions" value={practice.submissions} />
      <MetricTile label="Questions solved" value={practice.solved} />
      <MetricTile label="Average score" value={practice.averageScore} />
      <MetricTile label="Last submission" value={practice.lastSubmissionAt ? fmtDate(practice.lastSubmissionAt) : 'None'} />
    </div>
    {practice.excludedScores > 0 && (
      <FootNote>{practice.excludedScores} score{practice.excludedScores === 1 ? '' : 's'} not counted (fallback or unconfirmed AI scores).</FootNote>
    )}
  </div>
);

const ProfileSkeleton = () => (
  <div role="status" className="space-y-4">
    <Skeleton className="h-10 w-1/2" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" rounded="rounded-3xl" />)}</div>
    <Skeleton className="h-64 w-full" rounded="rounded-3xl" />
    <span className="sr-only">Loading the student&apos;s record...</span>
  </div>
);

// One student's record for lecturers and admins. The server audits every view.
const StudentProfile = () => {
  const { id } = useParams();
  const location = useLocation();
  const back = location.state?.from || '/staff';
  const [tab, setTab] = useState('interviews');
  const { data, error, loading } = useAnalyticsData(() => getStudent(id), id);
  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  const backButton = <Button as={Link} to={back} variant="secondary" size="sm" icon={<ArrowLeft size={15} aria-hidden="true" />}>All students</Button>;

  if (loading || error || !data) {
    return (
      <AppShell eyebrow="Student record" title={error ? 'Student not found' : 'Student'} actions={backButton}>
        {loading ? <ProfileSkeleton /> : <ErrorState message={error || 'Not found'} />}
      </AppShell>
    );
  }

  const { student, summary, interviews, cvAnalyses, skills, practice, delivery } = data;
  const tabs = [
    { id: 'interviews', label: `Mock interviews (${interviews.length})` },
    { id: 'cv', label: `CV analyses (${cvAnalyses.length})` },
    { id: 'skills', label: 'Skills' },
    { id: 'practice', label: 'Practice' },
  ];

  return (
    <AppShell
      eyebrow="Student record"
      title={student.name}
      subtitle={(
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <span>{student.email}</span>
          <span aria-hidden="true">|</span>
          <span>{student.group ? `Group: ${student.group}` : 'No group'}</span>
          <span aria-hidden="true">|</span>
          <span>Last active: {fmtLastActive(summary.lastActive)}</span>
        </span>
      )}
      actions={backButton}
    >
      <PrivacyNote />
      <div className="space-y-6">
        <section aria-label="Summary" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricTile label="Interviews completed" value={summary.interviewsCompleted} />
            <MetricTile label="Average interview score" value={summary.avgInterviewScore} hint={`Latest: ${fmtNum(summary.latestInterviewScore)}`} />
            <MetricTile label="Latest CV match" value={summary.latestCvMatch} suffix="%" />
            <MetricTile label="Practice solved" value={summary.practiceSolved} />
          </div>
          {summary.needsAttention.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span className="font-medium text-ink">To follow up:</span>
              <AttentionChips reasons={summary.needsAttention} />
            </div>
          )}
        </section>

        <Tabs tabs={tabs} value={tab} onChange={setTab} idBase="sp" ariaLabel="Student record sections" />
        <TabPanel id="interviews" value={tab} idBase="sp">
          <Interviews student={student} interviews={interviews} delivery={delivery} from={back} />
        </TabPanel>
        <TabPanel id="cv" value={tab} idBase="sp"><CvAnalyses analyses={cvAnalyses} /></TabPanel>
        <TabPanel id="skills" value={tab} idBase="sp"><Skills skills={skills} /></TabPanel>
        <TabPanel id="practice" value={tab} idBase="sp"><Practice practice={practice} /></TabPanel>
      </div>
    </AppShell>
  );
};

export default StudentProfile;
