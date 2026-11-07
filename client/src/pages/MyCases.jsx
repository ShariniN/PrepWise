import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import AppShell from '../components/AppShell';
import { Button, Card, EmptyState, Skeleton, Textarea } from '../components/ui';
import { listMyCases, respondToCase } from '../api/integrity';
import { errorMessage } from '../api/client';
import { fmtDateTime } from '../utils/assessment';

const CaseCard = ({ c, onSaved }) => {
  const [text, setText] = useState(c.studentResponse?.text || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) { toast.error('Write a response first'); return; }
    setBusy(true);
    try { const d = await respondToCase(c.id, text.trim()); onSaved(d.case); toast.success('Your response was sent'); }
    catch (err) { toast.error(errorMessage(err, 'Could not send your response')); } finally { setBusy(false); }
  };
  return (
    <Card as="article" className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{c.assessmentTitle}</h2>
        <p className="mt-1 text-xs text-ink-muted">Raised {fmtDateTime(c.escalatedAt)}</p>
      </div>
      <div className="rounded-2xl bg-sand p-4">
        <p className="text-sm text-ink-2">Your lecturer would like to hear from you about:</p>
        <ul className="list-disc pl-5 mt-2 text-sm text-ink space-y-1">
          {(c.reasons || []).map((r, i) => <li key={i}>{r.text}</li>)}
        </ul>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor={`resp-${c.id}`} className="block text-sm font-medium text-ink">Your response</label>
        <Textarea id={`resp-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={4000}
          placeholder="Anything you would like your lecturer to know, for example what happened and why." />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending...' : c.studentResponse?.text ? 'Update response' : 'Send response'}
          </Button>
          <span className="text-xs text-ink-muted">{text.length}/4000</span>
          {c.studentResponse?.at && <span className="text-xs text-ink-muted">Last sent {fmtDateTime(c.studentResponse.at)}</span>}
        </div>
      </form>
    </Card>
  );
};

const MyCases = () => {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listMyCases()
      .then((d) => { if (!cancelled) setCases(d.cases || []); })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e, 'Could not load')); setCases([]); } });
    return () => { cancelled = true; };
  }, []);

  const replace = (nc) => setCases((list) => list.map((x) => (x.id === nc.id ? { ...x, ...nc } : x)));

  return (
    <AppShell
      width="narrow"
      title="My cases"
      subtitle="Sometimes a lecturer asks a student about how an assessment went. Nothing has been decided. A person reads what you write before anything else happens, and technical problems such as a lost connection are never held against you."
    >
      <div className="space-y-5">
        {cases === null && <div role="status" aria-label="Loading"><Skeleton className="h-64 w-full" rounded="rounded-3xl" /></div>}
        {error && <p role="alert" className="rounded-2xl border border-danger-100 bg-danger-100 p-4 text-sm text-danger-700">{error}</p>}
        {cases && !error && cases.length === 0 && <EmptyState title="You have nothing waiting for a response." />}
        {(cases || []).map((c) => <CaseCard key={c.id} c={c} onSaved={replace} />)}
      </div>
    </AppShell>
  );
};

export default MyCases;
