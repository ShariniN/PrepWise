import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import NavBar from '../components/NavBar';
import CaseTimeline from '../components/integrity/CaseTimeline';
import ReasonList from '../components/integrity/ReasonList';
import CaseActions from '../components/integrity/CaseActions';
import SimilarityPanel from '../components/integrity/SimilarityPanel';
import { getCase, analyseSession } from '../api/integrity';
import { errorMessage } from '../api/client';
import { fmtDateTime, CASE_STATUS_LABELS, CASE_STATUS_STYLES, FLAGS_NOTE } from '../utils/assessment';

const Card = ({ title, children }) => (
  <section className="bg-white rounded-2xl shadow p-6 space-y-3">
    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
    {children}
  </section>
);

const IntegrityCase = () => {
  const { caseId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getCase(caseId)); setError(''); }
    catch (e) { setError(errorMessage(e, 'Could not load this case')); }
  }, [caseId]);
  useEffect(() => { load(); }, [load]);

  const reanalyse = async () => {
    setBusy(true);
    try { await analyseSession(data.case.sessionId); await load(); toast.success('Re-checked with the current limits'); }
    catch (e) { toast.error(errorMessage(e, 'Could not re-run')); } finally { setBusy(false); }
  };

  const replayQuestions = useMemo(() => {
    const ids = new Set();
    (data?.timeline?.items || []).forEach((i) => { if (i.kind === 'editing' && i.questionId) ids.add(i.questionId); });
    return [...ids];
  }, [data]);

  const shell = (children) => (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Link to="/integrity" className="text-sm text-indigo-700 hover:underline">&larr; Review queue</Link>
        {children}
      </main>
    </div>
  );

  if (error) return shell(<p role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{error}</p>);
  if (!data) return shell(<p className="text-gray-500" role="status">Loading case...</p>);
  const c = data.case;

  return shell(
    <>
      <section className="bg-white rounded-2xl shadow p-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-800 flex-1 min-w-[12rem]">{c.studentName}</h1>
          <span className={`text-xs rounded-full px-2 py-1 ${CASE_STATUS_STYLES[c.status] || ''}`}>{CASE_STATUS_LABELS[c.status] || c.status}</span>
        </div>
        <p className="text-sm text-gray-600">{c.studentEmail} &middot; {c.assessmentTitle} &middot; opened {fmtDateTime(c.createdAt)}</p>
        <p className="text-sm rounded bg-slate-50 border border-slate-200 p-2 text-slate-700">{FLAGS_NOTE}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" onClick={reanalyse} disabled={busy} className="underline text-indigo-700 disabled:opacity-50">Re-check this session</button>
          {replayQuestions.map((q, i) => (
            <Link key={q} className="underline text-indigo-700" to={`/integrity/replay/${c.sessionId}?questionId=${q}`}>
              Replay code{replayQuestions.length > 1 ? ` (question ${i + 1})` : ''}
            </Link>
          ))}
        </div>
      </section>

      <Card title="Reasons to look">
        <ReasonList reasons={c.reasons || []} technical={c.technical} />
      </Card>

      <Card title="Timeline">
        <CaseTimeline items={data.timeline?.items || []} truncated={data.timeline?.truncated} />
      </Card>

      <SimilarityPanel c={c} stored={data.similarity || []} />

      <Card title="Student response">
        {c.studentResponse?.text
          ? <><p className="text-sm text-gray-800 whitespace-pre-wrap">{c.studentResponse.text}</p><p className="text-xs text-gray-500">Written {fmtDateTime(c.studentResponse.at)}</p></>
          : <p className="text-sm text-gray-600">{c.status === 'escalated' ? 'The student has not responded yet.' : 'The student can respond only after a case is escalated.'}</p>}
      </Card>

      <Card title="Review">
        <CaseActions key={c.updatedAt} c={c} onUpdated={(nc) => setData((d) => ({ ...d, case: { ...d.case, ...nc } }))} />
      </Card>

      {(c.history || []).length > 0 && (
        <Card title="History">
          <ul className="text-sm text-gray-700 space-y-1">
            {c.history.map((h, i) => (
              <li key={i}>{fmtDateTime(h.at)} - {h.action}{h.from || h.to ? ` (${h.from || 'none'} to ${h.to || 'none'})` : ''}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
};

export default IntegrityCase;
