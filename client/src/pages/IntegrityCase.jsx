import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Badge, Button, Card as UiCard, Skeleton } from '../components/ui';
import CaseTimeline from '../components/integrity/CaseTimeline';
import ReasonList from '../components/integrity/ReasonList';
import CaseActions from '../components/integrity/CaseActions';
import SimilarityPanel from '../components/integrity/SimilarityPanel';
import { getCase, analyseSession } from '../api/integrity';
import { errorMessage } from '../api/client';
import { fmtDateTime, CASE_STATUS_LABELS, FLAGS_NOTE } from '../utils/assessment';

const CASE_TONES = { open: 'primary', escalated: 'warning', dismissed: 'neutral', resolved: 'success' };

const Card = ({ title, children }) => (
  <UiCard as="section" className="min-w-0 space-y-4">
    <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
    {children}
  </UiCard>
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
    <AppShell width="default">
      <div className="space-y-5">
        <Button as={Link} to="/integrity" variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />}>Review queue</Button>
        {children}
      </div>
    </AppShell>
  );

  if (error) return shell(<UiCard role="alert" tone="sand" className="text-danger-700">{error}</UiCard>);
  if (!data) return shell(<UiCard role="status" aria-label="Loading case" className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-24 w-full" /></UiCard>);
  const c = data.case;

  return shell(
    <>
      <UiCard as="section" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-[12rem] flex-1 font-display text-3xl font-semibold text-ink">{c.studentName}</h1>
          <Badge tone={CASE_TONES[c.status] || 'neutral'} dot>{CASE_STATUS_LABELS[c.status] || c.status}</Badge>
        </div>
        <p className="text-sm text-ink-2">{c.studentEmail} &middot; {c.assessmentTitle} &middot; opened {fmtDateTime(c.createdAt)}</p>
        <p className="rounded-2xl bg-sand p-3 text-sm text-ink-2">{FLAGS_NOTE}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={reanalyse} loading={busy}>Re-check this session</Button>
          {replayQuestions.map((q, i) => (
            <Button as={Link} size="sm" variant="secondary" key={q} to={`/integrity/replay/${c.sessionId}?questionId=${q}`}>
              Replay code{replayQuestions.length > 1 ? ` (question ${i + 1})` : ''}
            </Button>
          ))}
        </div>
      </UiCard>

      <Card title="Reasons to look">
        <ReasonList reasons={c.reasons || []} technical={c.technical} />
      </Card>

      <Card title="Timeline">
        <CaseTimeline items={data.timeline?.items || []} truncated={data.timeline?.truncated} />
      </Card>

      <SimilarityPanel c={c} stored={data.similarity || []} />

      <Card title="Student response">
        {c.studentResponse?.text
          ? <><p className="whitespace-pre-wrap text-sm text-ink">{c.studentResponse.text}</p><p className="text-xs text-ink-2">Written {fmtDateTime(c.studentResponse.at)}</p></>
          : <p className="text-sm text-ink-2">{c.status === 'escalated' ? 'The student has not responded yet.' : 'The student can respond only after a case is escalated.'}</p>}
      </Card>

      <Card title="Review">
        <CaseActions key={c.updatedAt} c={c} onUpdated={(nc) => setData((d) => ({ ...d, case: { ...d.case, ...nc } }))} />
      </Card>

      {(c.history || []).length > 0 && (
        <Card title="History">
          <ul className="space-y-1 text-sm text-ink-2">
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
