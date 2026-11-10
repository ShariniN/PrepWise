import React, { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CameraOff } from 'lucide-react';
import AppShell from '../components/AppShell';
import VerdictBadge from '../components/VerdictBadge';
import { Badge, Button, Card, CardTitle, Skeleton } from '../components/ui';
import { BarList } from '../components/analytics/Charts';
import { ErrorState } from '../components/analytics/EmptyState';
import MetricTile from '../components/lecturer/MetricTile';
import DeliverySummary from '../components/lecturer/DeliverySummary';
import { FootNote, PrivacyNote } from '../components/lecturer/Notice';
import useAnalyticsData from '../hooks/useAnalyticsData';
import { getStudentInterview } from '../api/lecturer';
import { CATEGORIES, FEEDBACK_SOURCE_LABELS, QUESTION_TYPE_LABELS, fmtDateTime, fmtDuration, fmtNum, isNum } from '../utils/lecturer';

// Rubric parts of the AI feedback, each 0-10.
const SUB_SCORES = [
  ['questionRelevance', 'Relevance'], ['technicalAccuracy', 'Technical accuracy'], ['structuredResponse', 'Structure'],
  ['communicationClarity', 'Communication'], ['correctness', 'Correctness'], ['syntax', 'Syntax'],
  ['languageBestPractices', 'Language practices'], ['efficiency', 'Efficiency'], ['structureAndReadability', 'Readability'],
  ['edgeCaseHandling', 'Edge cases'], ['codeQuality', 'Code quality'], ['timeEfficiency', 'Time efficiency'],
];

const SOURCE_TONE = { ai: 'primary', tests: 'success', human: 'success', fallback: 'warning' };

// Student text is shown exactly as written (never rendered as Markdown or HTML).
const Block = ({ label, children, mono }) => (
  <div>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">{label}</p>
    <pre className={`m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-line bg-paper p-3 text-sm text-ink ${mono ? 'font-mono' : 'font-sans'}`}>{children}</pre>
  </div>
);

const List = ({ title, items }) => (items?.length ? (
  <div>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">{title}</p>
    <ul className="ml-5 list-disc space-y-0.5 text-sm text-ink">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
  </div>
) : null);

const Answer = ({ q }) => {
  if (q.skipped) return <p className="text-sm text-ink-2">The student skipped this question.</p>;
  const a = q.answer;
  if (!a) return <p className="text-sm text-ink-2">Not answered.</p>;
  const timing = [
    isNum(a.responseTimeSec) ? `answered in ${fmtDuration(a.responseTimeSec)}` : null,
    isNum(a.recordingDurationSec) ? `recording ${fmtDuration(a.recordingDurationSec)}` : null,
    a.submittedAt ? `submitted ${fmtDateTime(a.submittedAt)}` : null,
  ].filter(Boolean).join(', ');
  return (
    <div className="space-y-3">
      {a.text && <Block label="Typed answer">{a.text}</Block>}
      {a.transcript && <Block label="Voice transcript">{a.transcript}</Block>}
      {a.code && <Block label={`Code${a.language ? ` (${a.language})` : ''}`} mono>{a.code}</Block>}
      {!a.text && !a.transcript && !a.code && <p className="text-sm text-ink-2">The answer is empty.</p>}
      {timing && <p className="text-xs text-ink-2">{timing.charAt(0).toUpperCase() + timing.slice(1)}.</p>}
    </div>
  );
};

const Execution = ({ ex }) => (
  <div className="space-y-2 rounded-2xl border border-line bg-paper p-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-ink">Code run</span>
      {ex.unavailable ? <VerdictBadge verdict="unavailable" size="sm" /> : <VerdictBadge verdict={ex.verdict} size="sm" />}
      {isNum(ex.testsTotal) && <span className="text-ink-2">{ex.testsPassed}/{ex.testsTotal} tests passed</span>}
      {ex.executionTime && <span className="text-ink-2">{ex.executionTime} s</span>}
      <span className="text-xs text-ink-2">{ex.serverVerified ? 'Run on the server' : 'Not verified by the server'}</span>
    </div>
    {ex.output && <Block label="Output" mono>{ex.output}</Block>}
    {ex.error && <Block label="Error" mono>{ex.error}</Block>}
  </div>
);

const Feedback = ({ q }) => {
  const f = q.feedback;
  if (!f) return <p className="text-sm text-ink-2">No feedback recorded.</p>;
  const subs = SUB_SCORES.filter(([k]) => isNum(f[k]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-2xl font-semibold text-ink tabular-nums">{fmtNum(f.score)}<span className="text-sm text-ink-2"> / 100</span></span>
        {q.feedbackSource === 'fallback' && <span className="text-sm text-ink-2">Not counted in any average.</span>}
      </div>
      {subs.length > 0 && (
        <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {subs.map(([k, label]) => (
            <div key={k} className="rounded-xl bg-paper px-3 py-2">
              <dt className="text-xs text-ink-2">{label}</dt>
              <dd className="m-0 text-sm font-semibold text-ink tabular-nums">{f[k]}/10</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <List title="Strengths" items={f.strengths} />
        <List title="To improve" items={f.improvements} />
      </div>
      {f.overallAssessment && <p className="text-sm text-ink"><span className="font-semibold">Overall: </span>{f.overallAssessment}</p>}
      {f.detailedAnalysis && <p className="text-sm text-ink-2">{f.detailedAnalysis}</p>}
    </div>
  );
};

const Delivery = ({ m }) => {
  if (!m) return null;
  const items = [
    m.cameraUsed && ['Face visible', fmtNum(m.faceVisiblePct, '%')],
    m.cameraUsed && ['Eye contact', fmtNum(m.eyeContactPct, '%')],
    m.cameraUsed && ['Look-aways', fmtNum(m.lookAwayCount)],
    m.cameraUsed && ['Head movement', m.headMovement || '-'],
    ['Pace', isNum(m.wordsPerMinute) ? `${m.wordsPerMinute} wpm` : '-'],
    ['Filler words', fmtNum(m.fillerWordCount)],
    ['Length', fmtDuration(m.durationSec)],
  ].filter(Boolean);
  return (
    <div className="rounded-2xl border border-line bg-paper p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        {m.cameraUsed ? <Camera size={16} aria-hidden="true" /> : <CameraOff size={16} aria-hidden="true" />}
        Delivery: camera {m.cameraUsed ? 'on' : 'off'}
      </p>
      <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {items.map(([label, v]) => (
          <div key={label} className="flex gap-1.5"><dt className="text-ink-2">{label}</dt><dd className="m-0 font-semibold text-ink tabular-nums">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
};

const Question = ({ q, n }) => (
  <Card as="li" className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-base font-semibold text-ink">Question {n}</span>
      {q.type && <Badge tone="neutral">{QUESTION_TYPE_LABELS[q.type] || q.type}</Badge>}
      {q.category && q.category !== (QUESTION_TYPE_LABELS[q.type] || q.type) && <Badge tone="neutral">{q.category}</Badge>}
      {q.difficulty && <Badge tone="neutral">{q.difficulty}</Badge>}
      {q.feedbackSource && (
        <Badge tone={SOURCE_TONE[q.feedbackSource] || 'neutral'}>{FEEDBACK_SOURCE_LABELS[q.feedbackSource] || q.feedbackSource}</Badge>
      )}
    </div>
    <p className="whitespace-pre-wrap text-base font-medium text-ink">{q.question || 'Question text not recorded.'}</p>
    <div className="grid gap-5 xl:grid-cols-2">
      <section aria-label={`Answer to question ${n}`} className="min-w-0 space-y-3">
        <h4 className="text-sm font-semibold text-ink">Answer</h4>
        <Answer q={q} />
        {q.executionResults && <Execution ex={q.executionResults} />}
        <Delivery m={q.deliveryMetrics} />
      </section>
      <section aria-label={`Feedback on question ${n}`} className="min-w-0 space-y-3">
        <h4 className="text-sm font-semibold text-ink">Feedback</h4>
        <Feedback q={q} />
      </section>
    </div>
  </Card>
);

// One mock interview of one student, as the lecturer sees it. The server audits every view.
const StudentInterview = () => {
  const { id, interviewId } = useParams();
  const location = useLocation();
  const { data, error, loading } = useAnalyticsData(() => getStudentInterview(id, interviewId), `${id}|${interviewId}`);
  useEffect(() => { window.scrollTo(0, 0); }, [id, interviewId]);
  const back = (
    <Button as={Link} to={`/staff/students/${id}`} state={{ from: location.state?.from }} variant="secondary" size="sm" icon={<ArrowLeft size={15} aria-hidden="true" />}>
      {data ? data.student.name : 'Student'}
    </Button>
  );

  if (loading || error || !data) {
    return (
      <AppShell eyebrow="Mock interview" title={error ? 'Interview not found' : 'Mock interview'} actions={back}>
        {loading ? (
          <div role="status" className="space-y-4">
            <Skeleton className="h-28 w-full" rounded="rounded-3xl" />
            <Skeleton className="h-64 w-full" rounded="rounded-3xl" />
            <span className="sr-only">Loading the interview...</span>
          </div>
        ) : <ErrorState message={error || 'Not found'} />}
      </AppShell>
    );
  }

  const { student, interview: iv } = data;
  const s = iv.summary || {};
  const hasSummary = s.generalFeedback || s.strengths?.length || s.improvements?.length || s.recommendations?.length;
  const answered = iv.questions.filter((q) => q.answered && !q.skipped).length;
  const skipped = iv.questions.filter((q) => q.skipped).length;

  return (
    <AppShell
      eyebrow={`${student.name}${student.group ? ` | ${student.group}` : ''}`}
      title={`Mock interview, ${fmtDateTime(iv.completedAt || iv.createdAt)}`}
      subtitle={iv.status === 'completed' ? undefined : `Status: ${iv.status.replace('_', ' ')}. Only completed interviews count in the averages.`}
      actions={back}
    >
      <PrivacyNote />
      <div className="space-y-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Interview score" value={iv.score} hint="Counted answers only" />
            <MetricTile label="Readiness" value={iv.readinessLevel || '-'} />
            <MetricTile label="Answers" value={`${answered} of ${iv.questions.length}`} hint={skipped ? `${skipped} skipped` : undefined} />
            <MetricTile label="Stored score" value={iv.storedOverallScore} hint="Includes fallback answers; for reference" />
          </div>
          <Card className="space-y-3">
            <BarList caption="Score by category (0 to 100)" suffix=""
              items={CATEGORIES.map((c) => ({ label: c.label, value: iv.categoryScores?.[c.key] ?? null }))} />
            <FootNote>
              {iv.excludedFallbackAnswers} answer{iv.excludedFallbackAnswers === 1 ? '' : 's'} scored by the basic fallback (AI unavailable) {iv.excludedFallbackAnswers === 1 ? 'is' : 'are'} not counted.
            </FootNote>
          </Card>
        </div>

        <Card as="section" aria-labelledby="iv-job">
          <details>
            <summary className="cursor-pointer font-display text-lg font-semibold text-ink" id="iv-job">Job description</summary>
            <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{iv.jobDescription || 'Not recorded.'}</p>
          </details>
        </Card>

        {hasSummary && (
          <Card as="section">
            <CardTitle>Interview summary</CardTitle>
            <div className="space-y-3">
              {s.generalFeedback && <p className="text-sm text-ink">{s.generalFeedback}</p>}
              <div className="grid gap-4 md:grid-cols-3">
                <List title="Strengths" items={s.strengths} />
                <List title="To improve" items={s.improvements} />
                <List title="Recommendations" items={s.recommendations} />
              </div>
            </div>
          </Card>
        )}

        <Card as="section" aria-labelledby="iv-del" className="space-y-3">
          <h2 id="iv-del" className="font-display text-lg font-semibold text-ink">Delivery in this interview</h2>
          {iv.delivery?.hasData
            ? <DeliverySummary delivery={iv.delivery} />
            : <p className="text-sm text-ink-2">No delivery data for this interview.</p>}
        </Card>

        <section aria-labelledby="iv-q" className="space-y-4">
          <h2 id="iv-q" className="font-display text-xl font-semibold text-ink">Questions and answers</h2>
          {iv.questions.length
            ? <ol className="m-0 list-none space-y-4 p-0">{iv.questions.map((q, i) => <Question key={q.questionId || i} q={q} n={i + 1} />)}</ol>
            : <p className="text-sm text-ink-2">No questions recorded.</p>}
        </section>
      </div>
    </AppShell>
  );
};

export default StudentInterview;
