import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import { grading } from '../../api/analytics';
import { errorCode, errorMessage } from '../../api/client';
import { ErrorState, LoadingState } from './EmptyState';

const inputCls = 'w-20 bg-gray-100 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400';

const FinalView = ({ final }) => (
  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm space-y-2">
    <p className="font-semibold text-green-900">Confirmed by a human: {final.total} / {final.maxTotal}</p>
    <ul className="list-disc ml-5">
      {final.criteria.map((c) => (
        <li key={c.name}>{c.name}: {c.points} / {c.maxPoints}{c.comment ? ` - ${c.comment}` : ''}</li>
      ))}
    </ul>
    {final.comment && <p>Comment: {final.comment}</p>}
    <p className="text-xs text-green-800">
      {final.acceptedAiSuggestion ? 'AI suggestion accepted as-is.' : 'Scored by the lecturer.'}{final.overrodeAi ? ' The AI suggestion was overridden.' : ''}
    </p>
  </div>
);

const GradingDetail = ({ id, onChanged }) => {
  const [item, setItem] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [points, setPoints] = useState({});
  const [comments, setComments] = useState({});
  const [overall, setOverall] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState(null); // { message, manual }

  const load = useCallback(async () => {
    setItem(null); setLoadError(''); setProblem(null);
    try {
      const { item: it } = await grading.item(id);
      setItem(it); setPoints({}); setComments({}); setOverall('');
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not load this answer'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!item) return <LoadingState />;

  const reviewed = item.status === 'reviewed';
  const rubric = item.rubric;
  const ai = item.aiSuggestion;

  const suggest = async () => {
    setBusy('suggest'); setProblem(null);
    try {
      const { aiSuggestion } = await grading.suggest(id);
      setItem((it) => ({ ...it, aiSuggestion, hasAiSuggestion: true }));
      onChanged?.();
    } catch (e) {
      const data = e?.response?.data || {};
      if (errorCode(e) === 'AI_MONTHLY_CAP') {
        setProblem({ message: data.message || 'Your university has reached its monthly AI limit.', manual: true });
      } else if (e?.response?.status === 502) {
        setProblem({ message: data.message || 'The AI produced nothing usable for this answer.', manual: true });
      } else if (e?.response?.status === 409) {
        setProblem({ message: errorMessage(e), manual: false });
        load();
      } else {
        setProblem({ message: errorMessage(e, 'Could not get an AI suggestion'), manual: false });
      }
    } finally { setBusy(''); }
  };

  const copySuggestion = () => {
    const p = {}; const c = {};
    ai.criteria.forEach((cr) => { p[cr.name] = String(cr.points); c[cr.name] = ''; });
    setPoints(p); setComments(c);
  };

  const submit = async (body, okMsg) => {
    setBusy('confirm'); setProblem(null);
    try {
      const { item: updated } = await grading.confirm(id, body);
      setItem((it) => ({ ...it, ...updated }));
      toast.success(okMsg);
      onChanged?.();
      load();
    } catch (e) {
      setProblem({ message: errorMessage(e, 'Could not save the grade'), manual: false });
      if (e?.response?.status === 409) load();
    } finally { setBusy(''); }
  };

  const confirmManual = (e) => {
    e.preventDefault();
    const criteria = [];
    for (const r of rubric) {
      const raw = points[r.name];
      const n = Number(raw);
      if (raw === undefined || raw === '' || Number.isNaN(n) || n < 0 || n > r.maxPoints) {
        setProblem({ message: `Enter points between 0 and ${r.maxPoints} for "${r.name}".`, manual: false });
        return;
      }
      criteria.push({ name: r.name, points: n, ...(comments[r.name]?.trim() ? { comment: comments[r.name].trim() } : {}) });
    }
    submit({ criteria, ...(overall.trim() ? { comment: overall.trim() } : {}) }, 'Grade confirmed');
  };

  const total = rubric ? rubric.reduce((a, r) => a + (Number(points[r.name]) || 0), 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">{item.questionTitle}</h2>
        <p className="text-xs text-gray-500">{item.studentName} | {item.questionType} | submitted {new Date(item.submittedAt).toLocaleString()}</p>
      </div>

      <section aria-label="Question" className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm whitespace-pre-wrap">{item.question?.statement}</section>

      <section aria-label="Student answer">
        <h3 className="text-sm font-semibold text-gray-700">Student answer</h3>
        <div className="rounded-lg border border-gray-200 p-3 text-sm whitespace-pre-wrap bg-white">{item.answer}</div>
      </section>

      {!rubric && (
        <ErrorState message="This question has no rubric, so it cannot be graded yet. Add a rubric in the question editor." />
      )}

      {rubric && (
        <section aria-label="Rubric">
          <h3 className="text-sm font-semibold text-gray-700">Rubric (total {item.rubricTotal})</h3>
          <ul className="text-sm text-gray-600 list-disc ml-5">
            {rubric.map((r) => <li key={r.name}><strong>{r.name}</strong> ({r.maxPoints} pts){r.description ? `: ${r.description}` : ''}</li>)}
          </ul>
        </section>
      )}

      {problem && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800" role="alert">
          <p>{problem.message}</p>
          {problem.manual && <p className="font-semibold mt-1">Manual grading is still available below.</p>}
        </div>
      )}

      {reviewed && item.final && <FinalView final={item.final} />}

      {!reviewed && rubric && (
        <>
          <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-2" aria-label="AI suggestion">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-indigo-900 flex items-center gap-1"><Sparkles size={14} aria-hidden="true" /> AI suggestion - not a grade</p>
              <button type="button" onClick={suggest} disabled={busy === 'suggest'}
                className="text-sm rounded-md bg-white border border-indigo-300 px-3 py-1.5 hover:bg-indigo-100 disabled:opacity-60">
                {busy === 'suggest' ? 'Asking...' : ai ? 'Get a new AI suggestion' : 'Get AI suggestion'}
              </button>
            </div>
            {ai ? (
              <div className="text-sm text-indigo-950 space-y-2">
                <p>Suggested {ai.total} / {ai.maxTotal}. It becomes a score only when you confirm it.</p>
                <ul className="space-y-1">
                  {ai.criteria.map((c) => (
                    <li key={c.name}><strong>{c.name}</strong>: {c.points} / {c.maxPoints}<br /><span className="text-indigo-900">Reason: {c.reason}</span></li>
                  ))}
                </ul>
                {ai.summary && <p>Summary: {ai.summary}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={copySuggestion} className="text-sm underline">Copy into the inputs below to edit</button>
                  <button type="button" disabled={busy === 'confirm'}
                    onClick={() => submit({ acceptAiSuggestion: true }, 'Suggestion confirmed as the grade')}
                    className="text-sm rounded-md bg-indigo-600 text-white px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-60">
                    Confirm the AI suggestion as the grade
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-indigo-900">No suggestion yet. Asking counts against the university&apos;s monthly AI allowance; you can always grade manually.</p>
            )}
          </section>

          <form onSubmit={confirmManual} className="space-y-3" aria-label="Manual grade">
            <h3 className="text-sm font-semibold text-gray-700">Your grade (confirm or override)</h3>
            {rubric.map((r) => (
              <div key={r.name} className="grid sm:grid-cols-[1fr_auto_2fr] gap-2 items-center">
                <label htmlFor={`pts-${r.name}`} className="text-sm text-gray-700">{r.name} (max {r.maxPoints})</label>
                <input id={`pts-${r.name}`} type="number" min="0" max={r.maxPoints} step="any" className={inputCls}
                  value={points[r.name] ?? ''} onChange={(e) => setPoints({ ...points, [r.name]: e.target.value })} />
                <input type="text" aria-label={`Comment for ${r.name}`} placeholder="Optional comment" className="bg-gray-100 rounded-md px-2 py-1 text-sm"
                  value={comments[r.name] ?? ''} onChange={(e) => setComments({ ...comments, [r.name]: e.target.value })} />
              </div>
            ))}
            <textarea aria-label="Overall comment" placeholder="Overall comment (optional)" rows={2} className="w-full bg-gray-100 rounded-md px-2 py-1 text-sm"
              value={overall} onChange={(e) => setOverall(e.target.value)} />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy === 'confirm'} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md px-4 py-2 disabled:opacity-60">
                {busy === 'confirm' ? 'Saving...' : 'Confirm grade'}
              </button>
              <span className="text-sm text-gray-500">Total {total} / {item.rubricTotal}</span>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default GradingDetail;
