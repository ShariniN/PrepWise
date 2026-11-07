import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import { grading } from '../../api/analytics';
import { errorCode, errorMessage } from '../../api/client';
import { ErrorState, LoadingState } from './EmptyState';
import { Button, Input, Textarea } from '../ui';

const FinalView = ({ final }) => (
  <div className="rounded-2xl border border-success-200 bg-success-50 p-4 text-sm space-y-2 text-ink">
    <p className="font-semibold text-success-700">Confirmed by a human: {final.total} / {final.maxTotal}</p>
    <ul className="list-disc ml-5">
      {final.criteria.map((c) => (
        <li key={c.name}>{c.name}: {c.points} / {c.maxPoints}{c.comment ? ` - ${c.comment}` : ''}</li>
      ))}
    </ul>
    {final.comment && <p>Comment: {final.comment}</p>}
    <p className="text-xs text-ink-2">
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
        <h2 className="font-display text-xl font-semibold text-ink">{item.questionTitle}</h2>
        <p className="mt-1 text-xs text-ink-2">{item.studentName} | {item.questionType} | submitted {new Date(item.submittedAt).toLocaleString()}</p>
      </div>

      <section aria-label="Question" className="rounded-2xl bg-sand p-4 text-sm whitespace-pre-wrap text-ink">{item.question?.statement}</section>

      <section aria-label="Student answer">
        <h3 className="mb-1.5 text-sm font-semibold text-ink">Student answer</h3>
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm whitespace-pre-wrap text-ink">{item.answer}</div>
      </section>

      {!rubric && (
        <ErrorState message="This question has no rubric, so it cannot be graded yet. Add a rubric in the question editor." />
      )}

      {rubric && (
        <section aria-label="Rubric">
          <h3 className="mb-1.5 text-sm font-semibold text-ink">Rubric (total {item.rubricTotal})</h3>
          <ul className="ml-5 list-disc space-y-0.5 text-sm text-ink-2">
            {rubric.map((r) => <li key={r.name}><strong>{r.name}</strong> ({r.maxPoints} pts){r.description ? `: ${r.description}` : ''}</li>)}
          </ul>
        </section>
      )}

      {problem && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700" role="alert">
          <p>{problem.message}</p>
          {problem.manual && <p className="font-semibold mt-1">Manual grading is still available below.</p>}
        </div>
      )}

      {reviewed && item.final && <FinalView final={item.final} />}

      {!reviewed && rubric && (
        <>
          <section className="rounded-2xl border border-primary-100 bg-primary-50 p-4 space-y-3" aria-label="AI suggestion">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-800"><Sparkles size={14} aria-hidden="true" /> AI suggestion - not a grade</p>
              <Button size="sm" variant="secondary" loading={busy === 'suggest'} onClick={suggest}>
                {busy === 'suggest' ? 'Asking...' : ai ? 'Get a new AI suggestion' : 'Get AI suggestion'}
              </Button>
            </div>
            {ai ? (
              <div className="text-sm text-ink space-y-2">
                <p>Suggested {ai.total} / {ai.maxTotal}. It becomes a score only when you confirm it.</p>
                <ul className="space-y-1">
                  {ai.criteria.map((c) => (
                    <li key={c.name}><strong>{c.name}</strong>: {c.points} / {c.maxPoints}<br /><span className="text-ink-2">Reason: {c.reason}</span></li>
                  ))}
                </ul>
                {ai.summary && <p>Summary: {ai.summary}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={copySuggestion}>Copy into the inputs below to edit</Button>
                  <Button size="sm" loading={busy === 'confirm'}
                    onClick={() => submit({ acceptAiSuggestion: true }, 'Suggestion confirmed as the grade')}>
                    Confirm the AI suggestion as the grade
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-2">No suggestion yet. Asking counts against the university&apos;s monthly AI allowance; you can always grade manually.</p>
            )}
          </section>

          <form onSubmit={confirmManual} className="space-y-3" aria-label="Manual grade">
            <h3 className="text-sm font-semibold text-ink">Your grade (confirm or override)</h3>
            {rubric.map((r) => (
              <div key={r.name} className="grid items-center gap-2 sm:grid-cols-[1fr_5.5rem_2fr]">
                <label htmlFor={`pts-${r.name}`} className="text-sm font-medium text-ink">{r.name} (max {r.maxPoints})</label>
                <Input id={`pts-${r.name}`} type="number" min="0" max={r.maxPoints} step="any"
                  value={points[r.name] ?? ''} onChange={(e) => setPoints({ ...points, [r.name]: e.target.value })} />
                <Input type="text" aria-label={`Comment for ${r.name}`} placeholder="Optional comment"
                  value={comments[r.name] ?? ''} onChange={(e) => setComments({ ...comments, [r.name]: e.target.value })} />
              </div>
            ))}
            <Textarea aria-label="Overall comment" placeholder="Overall comment (optional)" rows={2}
              value={overall} onChange={(e) => setOverall(e.target.value)} />
            <div className="flex items-center gap-3">
              <Button type="submit" loading={busy === 'confirm'}>
                {busy === 'confirm' ? 'Saving...' : 'Confirm grade'}
              </Button>
              <span className="text-sm text-ink-2">Total {total} / {item.rubricTotal}</span>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default GradingDetail;
