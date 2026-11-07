import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Button, Card, Skeleton } from '../components/ui';
import Markdown from '../components/Markdown';
import RecordedNotice from '../components/assessment/RecordedNotice';
import { getAssessment, startAssessment } from '../api/assessments';
import { errorMessage, errorCode } from '../api/client';
import { fmtDateTime, fmtDuration, readAck, writeAck } from '../utils/assessment';

const START_ERRORS = {
  NOT_OPEN: 'This assessment is not open right now.',
  NO_ATTEMPTS_LEFT: 'You have used all your attempts.',
  QUESTION_MISSING: 'A question in this assessment is unavailable. Please tell your lecturer.',
};

const AssessmentIntro = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getAssessment(id);
        if (!cancelled) setA(d.assessment);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, 'Could not load this assessment'));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const shell = (children) => (
    <AppShell width="narrow">
      <div className="space-y-5">
        <Button as={Link} to="/assessments" variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />}>All assessments</Button>
        {children}
      </div>
    </AppShell>
  );

  if (error) return shell(<Card role="alert" tone="sand" className="text-danger-700">{error}</Card>);
  if (!a) return shell(<Card role="status" aria-label="Loading" className="space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-20 w-full" /></Card>);

  const sessions = a.sessions || [];
  const active = sessions.find((s) => s.status === 'active');
  const finished = sessions.filter((s) => s.status !== 'active');
  const monitored = a.integrityLevel > 0;
  const alreadyAcked = !!readAck(a.id);
  const needsAck = monitored && !active && !alreadyAcked;

  const start = async () => {
    setBusy(true); setStartError('');
    try {
      // The API documents no consent endpoint, so the acknowledgement is kept in this browser
      // and noted on the start request.
      const body = monitored ? { integrityAcknowledged: true, acknowledgedAt: writeAck(a.id) } : {};
      const d = await startAssessment(a.id, body);
      navigate(`/assessments/session/${d.session.id}`);
    } catch (e) {
      setStartError(START_ERRORS[errorCode(e)] || errorMessage(e, 'Could not start'));
    } finally { setBusy(false); }
  };

  return shell(
    <>
      <Card as="section" className="space-y-4">
        <h1 className="font-display text-3xl font-semibold text-ink">{a.title}</h1>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ['Time allowed', fmtDuration(a.durationMinutes)],
            ['Questions', a.questionCount],
            ['Attempts', `${sessions.length} of ${a.attemptsAllowed} used`],
            ['Status', <span key="s" className="capitalize">{a.status}</span>],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-sand px-4 py-3"><dt className="text-xs text-ink-2">{k}</dt><dd className="mt-0.5 font-semibold text-ink">{v}</dd></div>
          ))}
        </dl>
        <p className="text-sm text-ink-2">Available {fmtDateTime(a.opensAt)} to {fmtDateTime(a.closesAt)}. The timer starts when you press Start and cannot be paused. Your time is also capped by the closing time.</p>
        {a.instructions && <Markdown text={a.instructions} />}
        {!a.releaseResults && <p className="text-sm text-ink-2">Your lecturer will release results later. You will see &quot;Answer saved&quot; after each submission, not a score.</p>}
      </Card>

      <RecordedNotice integrityLevel={a.integrityLevel} />

      <Card as="section" tone="primary" className="space-y-4">
        {active ? (
          <>
            <p className="text-sm text-ink">You have an attempt in progress. The timer kept running.</p>
            <Button size="lg" onClick={start} loading={busy}>
              {busy ? 'Opening...' : 'Resume attempt'}
            </Button>
          </>
        ) : a.canStart ? (
          <>
            {needsAck && (
              <label className="flex items-start gap-3 text-sm text-ink">
                <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line accent-primary-600" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I have read what is recorded during this assessment and I understand it.</span>
              </label>
            )}
            <Button size="lg" onClick={start} loading={busy} disabled={needsAck && !ack} className="max-w-full whitespace-normal text-center">
              {busy ? 'Starting...' : `Start (${fmtDuration(a.durationMinutes)} timer begins now)`}
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink">
            {a.status === 'scheduled' ? `This assessment opens ${fmtDateTime(a.opensAt)}.` : sessions.length >= a.attemptsAllowed ? 'You have used all your attempts.' : 'This assessment is closed.'}
          </p>
        )}
        {startError && <p role="alert" className="text-sm text-danger-700">{startError}</p>}
      </Card>

      {finished.length > 0 && (
        <Card as="section">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Your attempts</h2>
          <ul className="space-y-2 text-sm text-ink-2">
            {finished.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-3">
                <span className="font-medium text-ink">Attempt {s.attemptNo}</span>
                <span>submitted {fmtDateTime(s.submittedAt)}</span>
                {a.releaseResults && <Link className="font-semibold text-primary-700 underline" to={`/assessments/session/${s.id}/results`}>View results</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
};

export default AssessmentIntro;
