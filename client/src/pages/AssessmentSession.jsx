import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Button, Card, Modal, Skeleton } from '../components/ui';
import QuestionNavigator from '../components/assessment/QuestionNavigator';
import SessionQuestion from '../components/assessment/SessionQuestion';
import { ReturnedBanner, OfflineBanner, TimeWarning, TimeUpPanel } from '../components/assessment/SessionBanners';
import useServerCountdown from '../hooks/useServerCountdown';
import useIntegrityEvents from '../hooks/useIntegrityEvents';
import { getSession, finishSession } from '../api/assessments';
import { errorMessage, errorCode } from '../api/client';
import { fmtClock, readSubmitted, markSubmitted } from '../utils/assessment';

const WARN_AT = [10, 5, 1]; // minutes
const RESYNC_MS = 60000;

const ActiveSession = ({ initial, sessionId }) => {
  const session = initial;
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(() => readSubmitted(sessionId));
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState('active'); // active | timeup | finished | ended
  const [endedCode, setEndedCode] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [warn, setWarn] = useState(0);
  const warned = useRef(new Set());
  const finishCalled = useRef(false);

  const { remainingMs, remainingSeconds, sync } = useServerCountdown(initial.deadline, initial.serverNow);
  const questions = useMemo(() => session.questions || [], [session.questions]);
  const q = questions[current];
  const live = phase === 'active';

  const integrity = useIntegrityEvents({
    sessionId,
    signals: session.signals,
    enabled: live && session.integrityLevel > 0 && (session.signals || []).length > 0,
    serverElapsedMs: Math.max(0, Date.parse(initial.serverNow) - Date.parse(initial.serverStartedAt)),
    getQuestionId: useCallback(() => questions[current]?.questionId, [questions, current]),
  });

  // Pick up lecturer extensions and correct drift by asking the server for the deadline now and then.
  useEffect(() => {
    if (!live) return undefined;
    const iv = setInterval(async () => {
      try {
        const d = await getSession(sessionId);
        sync(d.session.deadline, d.session.serverNow);
        if (d.session.status === 'submitted') setPhase('finished');
      } catch { /* offline: keep counting from the last sync */ }
    }, RESYNC_MS);
    return () => clearInterval(iv);
  }, [live, sessionId, sync]);

  const endSession = useCallback(async () => {
    if (finishCalled.current) return true;
    try {
      await finishSession(sessionId);
      finishCalled.current = true;
      return true;
    } catch (e) {
      if (errorCode(e) === 'SESSION_ENDED') { finishCalled.current = true; return true; }
      throw e;
    }
  }, [sessionId]);

  const onTimeUp = useCallback(() => setPhase((p) => (p === 'active' ? 'timeup' : p)), []);
  const onEnded = useCallback((code) => { setEndedCode(code); setPhase((p) => (p === 'active' ? 'ended' : p)); }, []);
  const onSubmitted = useCallback((qid) => setSubmitted(markSubmitted(sessionId, qid)), [sessionId]);

  // Time reached zero on the server clock: let the last autosave land, then end the session.
  useEffect(() => {
    if (phase === 'active' && remainingMs <= 0) onTimeUp();
  }, [phase, remainingMs, onTimeUp]);

  useEffect(() => {
    if (phase !== 'timeup') return undefined;
    const t = setTimeout(() => { endSession().catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, [phase, endSession]);

  // Warnings at 10, 5 and 1 minutes (only the smallest threshold that has been crossed is shown).
  useEffect(() => {
    if (!live || remainingSeconds <= 0) return;
    const crossed = WARN_AT.filter((m) => remainingSeconds <= m * 60 && !warned.current.has(m));
    if (crossed.length === 0) return;
    crossed.forEach((m) => warned.current.add(m));
    setWarn(Math.min(...crossed));
  }, [remainingSeconds, live]);

  const finish = async () => {
    setFinishing(true); setFinishError('');
    try {
      await endSession();
      setConfirm(false);
      setPhase('finished');
    } catch (e) {
      if (errorCode(e) === 'TIME_UP') { setConfirm(false); onTimeUp(); }
      else setFinishError(e?.response ? errorMessage(e, 'Could not finish') : 'You seem to be offline. Try again when your connection is back; your answers are safe.');
    } finally { setFinishing(false); }
  };

  const missing = questions.filter((x) => !submitted.includes(x.questionId));
  const lowTime = remainingSeconds <= 300;

  if (phase === 'finished' || phase === 'ended' || phase === 'timeup') {
    return (
      <div className="space-y-4">
        {phase === 'timeup' || phase === 'ended' ? (
          <TimeUpPanel finished={phase === 'ended' || finishCalled.current}
            releaseResults={session.releaseResults} resultsHref={`/assessments/session/${sessionId}/results`} listHref="/assessments" />
        ) : (
          <Card className="mx-auto max-w-xl space-y-3 text-center">
            <h2 className="font-display text-2xl font-semibold text-ink">Your attempt is submitted</h2>
            <p className="text-sm text-ink-2">
              {session.releaseResults
                ? 'You can look at your results now.'
                : 'Your lecturer will release results later. There is nothing more to do.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              {session.releaseResults && <Button as={Link} to={`/assessments/session/${sessionId}/results`}>View results</Button>}
              <Button as={Link} to="/assessments" variant="secondary">Back to assessments</Button>
            </div>
          </Card>
        )}
        {phase === 'ended' && endedCode === 'ASSESSMENT_CLOSED' && (
          <p className="text-sm text-ink-2 text-center">Your lecturer closed this assessment. Answers you had already saved were kept.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-surface/95 p-3 pl-5 shadow-card backdrop-blur sm:top-4">
        <h1 className="min-w-[10rem] flex-1 truncate font-display text-lg font-semibold text-ink">{session.title}</h1>
        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xl font-semibold tabular-nums ${lowTime ? 'bg-sun-100 text-sun-700' : 'bg-sand text-ink'}`}
          role="timer" aria-label="Time remaining"
        >
          <Clock size={18} aria-hidden="true" />
          {fmtClock(remainingSeconds)}
        </div>
        <Button variant="dark" onClick={() => { setFinishError(''); setConfirm(true); }}>Finish</Button>
      </div>

      <TimeWarning minutes={warn} onDismiss={() => setWarn(0)} />
      <ReturnedBanner notice={integrity.returnedNotice} onDismiss={integrity.dismissNotice} />
      <OfflineBanner offline={integrity.offline} pending={pending} />

      <div className="flex flex-wrap items-center gap-3">
        <QuestionNavigator questions={questions} current={current} submitted={submitted} onSelect={setCurrent} />
        <span className="text-sm text-ink-2">Question {current + 1} of {questions.length}</span>
      </div>

      {q && (
        <SessionQuestion key={q.questionId} sessionId={sessionId} questionId={q.questionId}
          onTimeUp={onTimeUp} onEnded={onEnded} onSubmitted={onSubmitted} onPending={setPending} />
      )}

      <div className="flex justify-between">
        <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</Button>
        <Button variant="secondary" disabled={current >= questions.length - 1} onClick={() => setCurrent((c) => c + 1)}>Next</Button>
      </div>

      {confirm && (
        <Modal
          open
          onClose={() => setConfirm(false)}
          title="Finish this attempt?"
          footer={(
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button loading={finishing} onClick={finish}>Finish and submit</Button>
            </>
          )}
        >
          <div className="space-y-3 text-sm text-ink-2">
            <p>You will not be able to change your answers afterwards.</p>
            {missing.length > 0 && (
              <p className="rounded-2xl bg-sun-50 p-3 text-ink">
                No submitted answer yet for: {missing.map((m) => `question ${m.index + 1}`).join(', ')}.
                Code that is only auto-saved as a draft is kept, but pressing Submit on a question makes sure it is marked.
              </p>
            )}
            {finishError && <p role="alert" className="text-danger-700">{finishError}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
};

const AssessmentSession = () => {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getSession(sessionId);
        if (!cancelled) setSession(d.session);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, 'Could not open this attempt'));
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  let body;
  if (error) {
    body = (
      <Card role="alert" tone="sand" className="mx-auto max-w-xl space-y-3 text-center">
        <p className="text-danger-700">{error}</p>
        <Button as={Link} to="/assessments" variant="secondary">Back to assessments</Button>
      </Card>
    );
  } else if (!session) {
    body = <Card role="status" aria-label="Loading your attempt" className="space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64 w-full" /></Card>;
  } else if (session.status === 'submitted' || session.remainingSeconds <= 0) {
    body = (
      <Card className="mx-auto max-w-xl space-y-3 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">This attempt has ended</h1>
        <p className="text-sm text-ink-2">Your saved answers were submitted.</p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          {session.releaseResults && <Button as={Link} to={`/assessments/session/${sessionId}/results`}>View results</Button>}
          <Button as={Link} to="/assessments" variant="secondary">Back to assessments</Button>
        </div>
      </Card>
    );
  } else body = <ActiveSession initial={session} sessionId={sessionId} />;

  // Focused exam layout: no site navigation while the attempt is on screen.
  return <AppShell nav={false} width="wide">{body}</AppShell>;
};

export default AssessmentSession;
