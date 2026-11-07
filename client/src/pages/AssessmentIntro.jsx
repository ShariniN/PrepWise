import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
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
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Link to="/assessments" className="text-sm text-indigo-700 hover:underline">&larr; All assessments</Link>
        {children}
      </main>
    </div>
  );

  if (error) return shell(<div role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{error}</div>);
  if (!a) return shell(<p className="text-gray-500" role="status">Loading...</p>);

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
      <section className="bg-white rounded-2xl shadow p-6 space-y-3">
        <h1 className="text-2xl font-bold text-gray-800">{a.title}</h1>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div><dt className="text-gray-500">Time allowed</dt><dd className="font-medium">{fmtDuration(a.durationMinutes)}</dd></div>
          <div><dt className="text-gray-500">Questions</dt><dd className="font-medium">{a.questionCount}</dd></div>
          <div><dt className="text-gray-500">Attempts</dt><dd className="font-medium">{sessions.length} of {a.attemptsAllowed} used</dd></div>
          <div><dt className="text-gray-500">Status</dt><dd className="font-medium capitalize">{a.status}</dd></div>
        </dl>
        <p className="text-sm text-gray-600">Available {fmtDateTime(a.opensAt)} to {fmtDateTime(a.closesAt)}. The timer starts when you press Start and cannot be paused. Your time is also capped by the closing time.</p>
        {a.instructions && <Markdown text={a.instructions} />}
        {!a.releaseResults && <p className="text-sm text-gray-600">Your lecturer will release results later. You will see &quot;Answer saved&quot; after each submission, not a score.</p>}
      </section>

      <RecordedNotice integrityLevel={a.integrityLevel} />

      <section className="bg-white rounded-2xl shadow p-6 space-y-3">
        {active ? (
          <>
            <p className="text-sm text-gray-700">You have an attempt in progress. The timer kept running.</p>
            <button type="button" onClick={start} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Opening...' : 'Resume attempt'}
            </button>
          </>
        ) : a.canStart ? (
          <>
            {needsAck && (
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I have read what is recorded during this assessment and I understand it.</span>
              </label>
            )}
            <button type="button" onClick={start} disabled={busy || (needsAck && !ack)}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? 'Starting...' : `Start (${fmtDuration(a.durationMinutes)} timer begins now)`}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-700">
            {a.status === 'scheduled' ? `This assessment opens ${fmtDateTime(a.opensAt)}.` : sessions.length >= a.attemptsAllowed ? 'You have used all your attempts.' : 'This assessment is closed.'}
          </p>
        )}
        {startError && <p role="alert" className="text-sm text-red-700">{startError}</p>}
      </section>

      {finished.length > 0 && (
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-semibold text-gray-800 text-sm mb-2">Your attempts</h2>
          <ul className="text-sm text-gray-700 space-y-1">
            {finished.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-3">
                <span>Attempt {s.attemptNo}</span>
                <span>submitted {fmtDateTime(s.submittedAt)}</span>
                {a.releaseResults && <Link className="text-indigo-700 underline" to={`/assessments/session/${s.id}/results`}>View results</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

export default AssessmentIntro;
