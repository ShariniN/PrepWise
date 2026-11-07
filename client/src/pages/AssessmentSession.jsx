import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import ConfirmDialog from '../components/analytics/ConfirmDialog';
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
          <div className="rounded-2xl bg-white shadow p-6 text-center space-y-3">
            <h2 className="text-xl font-bold text-gray-800">Your attempt is submitted</h2>
            <p className="text-sm text-gray-700">
              {session.releaseResults
                ? 'You can look at your results now.'
                : 'Your lecturer will release results later. There is nothing more to do.'}
            </p>
            <div className="flex justify-center gap-4 text-sm">
              {session.releaseResults && <Link className="text-indigo-700 underline" to={`/assessments/session/${sessionId}/results`}>View results</Link>}
              <Link className="text-indigo-700 underline" to="/assessments">Back to assessments</Link>
            </div>
          </div>
        )}
        {phase === 'ended' && endedCode === 'ASSESSMENT_CLOSED' && (
          <p className="text-sm text-gray-600 text-center">Your lecturer closed this assessment. Answers you had already saved were kept.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10">
        <h1 className="font-bold text-gray-800 flex-1 min-w-[10rem]">{session.title}</h1>
        <div className={`font-mono text-lg font-semibold ${lowTime ? 'text-red-700' : 'text-gray-800'}`} role="timer" aria-label="Time remaining">
          {fmtClock(remainingSeconds)}
        </div>
        <button type="button" onClick={() => { setFinishError(''); setConfirm(true); }}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900">Finish</button>
      </div>

      <TimeWarning minutes={warn} onDismiss={() => setWarn(0)} />
      <ReturnedBanner notice={integrity.returnedNotice} onDismiss={integrity.dismissNotice} />
      <OfflineBanner offline={integrity.offline} pending={pending} />

      <div className="flex flex-wrap items-center gap-3">
        <QuestionNavigator questions={questions} current={current} submitted={submitted} onSelect={setCurrent} />
        <span className="text-xs text-gray-500">Question {current + 1} of {questions.length}</span>
      </div>

      {q && (
        <SessionQuestion key={q.questionId} sessionId={sessionId} questionId={q.questionId}
          onTimeUp={onTimeUp} onEnded={onEnded} onSubmitted={onSubmitted} onPending={setPending} />
      )}

      <div className="flex justify-between">
        <button type="button" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}
          className="px-3 py-2 rounded-lg bg-white border text-sm disabled:opacity-40">Previous</button>
        <button type="button" disabled={current >= questions.length - 1} onClick={() => setCurrent((c) => c + 1)}
          className="px-3 py-2 rounded-lg bg-white border text-sm disabled:opacity-40">Next</button>
      </div>

      {confirm && (
        <ConfirmDialog title="Finish this attempt?" confirmLabel="Finish and submit" busy={finishing}
          onConfirm={finish} onCancel={() => setConfirm(false)}>
          <p>You will not be able to change your answers afterwards.</p>
          {missing.length > 0 && (
            <p className="text-amber-800">
              No submitted answer yet for: {missing.map((m) => `question ${m.index + 1}`).join(', ')}.
              Code that is only auto-saved as a draft is kept, but pressing Submit on a question makes sure it is marked.
            </p>
          )}
          {finishError && <p role="alert" className="text-red-700">{finishError}</p>}
        </ConfirmDialog>
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
  if (error) body = <div role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{error}</div>;
  else if (!session) body = <p className="text-gray-500" role="status">Loading your attempt...</p>;
  else if (session.status === 'submitted' || session.remainingSeconds <= 0) {
    body = (
      <div className="bg-white rounded-2xl shadow p-6 text-center space-y-2">
        <h1 className="text-xl font-bold text-gray-800">This attempt has ended</h1>
        <p className="text-sm text-gray-700">Your saved answers were submitted.</p>
        <div className="flex justify-center gap-4 text-sm">
          {session.releaseResults && <Link className="text-indigo-700 underline" to={`/assessments/session/${sessionId}/results`}>View results</Link>}
          <Link className="text-indigo-700 underline" to="/assessments">Back to assessments</Link>
        </div>
      </div>
    );
  } else body = <ActiveSession initial={session} sessionId={sessionId} />;

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4">{body}</main>
    </div>
  );
};

export default AssessmentSession;
