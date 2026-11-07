import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Badge, Button, Card, Chip, EmptyState, Field, Select, Skeleton } from '../components/ui';
import ReasonChips from '../components/integrity/ReasonChips';
import { listCases } from '../api/integrity';
import { listAssessments } from '../api/assessments';
import { errorMessage } from '../api/client';
import { fmtDateTime, CASE_STATUS_LABELS, FLAGS_NOTE, OUTCOMES } from '../utils/assessment';

const CASE_TONES = { open: 'primary', escalated: 'warning', dismissed: 'neutral', resolved: 'success' };

const STATUSES = ['open', 'escalated', 'dismissed', 'resolved'];

const IntegrityQueue = () => {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status') ?? 'open,escalated';
  const assessmentId = params.get('assessmentId') || '';
  const [cases, setCases] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const statuses = statusParam ? statusParam.split(',').filter(Boolean) : [];

  useEffect(() => {
    listAssessments().then((d) => setAssessments(d.assessments || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = {};
    if (statusParam) q.status = statusParam;
    if (assessmentId) q.assessmentId = assessmentId;
    (async () => {
      try {
        const d = await listCases(q);
        if (!cancelled) { setCases(d.cases || []); setError(''); }
      } catch (e) { if (!cancelled) { setError(errorMessage(e, 'Could not load cases')); setCases([]); } }
    })();
    return () => { cancelled = true; };
  }, [statusParam, assessmentId, tick]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, v)));
    setCases(null);
    setParams(next, { replace: true });
  };
  const toggle = (s) => {
    const cur = new Set(statuses);
    if (cur.has(s)) cur.delete(s); else cur.add(s);
    update({ status: [...cur].join(',') || STATUSES.join(',') });
  };

  return (
    <AppShell
      eyebrow="Lecturer"
      title="Integrity review"
      subtitle={FLAGS_NOTE}
    >
      <div className="space-y-5">
        <Card className="flex flex-wrap items-end gap-6">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-xs font-medium text-ink-2">Status</legend>
            {STATUSES.map((s) => (
              <Chip key={s} selected={statuses.includes(s)} onClick={() => toggle(s)}>{CASE_STATUS_LABELS[s]}</Chip>
            ))}
          </fieldset>
          <Field label="Assessment" className="min-w-[14rem]">
            {(p) => (
              <Select {...p} value={assessmentId} onChange={(e) => update({ assessmentId: e.target.value })}>
                <option value="">All assessments</option>
                {assessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </Select>
            )}
          </Field>
        </Card>

        <Card className="p-2 sm:p-3">
          {cases === null && <div role="status" aria-label="Loading cases" className="space-y-3 p-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
          {error && (
            <p role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm text-danger-700">
              {error} <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>Retry</Button>
            </p>
          )}
          {cases && !error && cases.length === 0 && (
            <EmptyState icon={<ShieldCheck size={24} aria-hidden="true" />} title="No cases to review" description="No cases match. A case exists only when a session has something a reviewer may want to read." className="border-0" />
          )}
          {cases && cases.length > 0 && (
            <ul className="divide-y divide-line">
              {cases.map((c) => (
                <li key={c.id}>
                  <Link to={`/integrity/${c.id}`} className="block space-y-2 rounded-2xl p-4 transition hover:bg-primary-50/60">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-ink">{c.studentName}</span>
                      <span className="text-xs text-ink-2">{c.studentEmail}</span>
                      <span className="flex-1" />
                      {c.hasStudentResponse && <Badge tone="primary">Student responded</Badge>}
                      <Badge tone={CASE_TONES[c.status] || 'neutral'} dot>{CASE_STATUS_LABELS[c.status] || c.status}</Badge>
                      {c.outcome && <span className="text-xs text-ink-2">{OUTCOMES[c.outcome] || c.outcome}</span>}
                    </div>
                    <div className="text-sm text-ink-2">{c.assessmentTitle} &middot; updated {fmtDateTime(c.updatedAt)}</div>
                    <ReasonChips codes={c.reasonCodes} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
};

export default IntegrityQueue;
