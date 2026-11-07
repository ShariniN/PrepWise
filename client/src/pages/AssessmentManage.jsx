import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Badge, Button, Card, EmptyState, Skeleton, StatusPill } from '../components/ui';
import SessionsPanel from '../components/assessment/SessionsPanel';
import StatusActions from '../components/assessment/StatusActions';
import { listAssessments } from '../api/assessments';
import { errorMessage } from '../api/client';
import { fmtDateTime, fmtDuration } from '../utils/assessment';

const TONES = { open: 'success', scheduled: 'primary', closed: 'neutral', draft: 'neutral' };

const AssessmentManage = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await listAssessments();
      setItems(d.assessments || []); setError('');
    } catch (e) { setError(errorMessage(e, 'Could not load assessments')); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const replace = (a) => setItems((list) => list.map((x) => (x.id === a.id ? { ...x, ...a } : x)));

  return (
    <AppShell
      eyebrow="Lecturer"
      title="Assessments"
      subtitle="Timed assessments for your courses. Integrity monitoring uses browser signals only."
      actions={(
        <>
          <Button as={Link} to="/integrity" variant="secondary">Review queue</Button>
          <Button as={Link} to="/assessments/manage/new" icon={<Plus size={16} aria-hidden="true" />}>New assessment</Button>
        </>
      )}
    >
      {items === null && (
        <Card role="status" aria-label="Loading" className="space-y-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></Card>
      )}
      {error && <Card role="alert" tone="sand" className="text-sm text-danger-700">{error}</Card>}
      {items && !error && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={24} aria-hidden="true" />}
          title="No assessments yet"
          description="Create a timed assessment from your published questions."
          action={<Button as={Link} to="/assessments/manage/new">New assessment</Button>}
        />
      )}

      {items && items.length > 0 && (
        <Card className="p-2 sm:p-3">
          <ul className="divide-y divide-line">
            {items.map((a) => (
              <li key={a.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <Link to={`/assessments/manage/${a.id}`} className="min-w-[12rem] flex-1 font-semibold text-primary-700 hover:underline">{a.title}</Link>
                  <StatusPill tone={TONES[a.effectiveStatus]}>{a.effectiveStatus}</StatusPill>
                  <span className="text-xs text-ink-2">{fmtDuration(a.durationMinutes)}</span>
                  <span className="text-xs text-ink-2">{(a.questionIds || []).length} questions</span>
                  <Badge>Level {a.integrityLevel}</Badge>
                  <span className="basis-full text-xs text-ink-2">{fmtDateTime(a.opensAt)} to {fmtDateTime(a.closesAt)}</span>
                  <div className="flex basis-full flex-wrap gap-2">
                    <StatusActions assessment={a} onChanged={replace} />
                    <Button size="sm" variant="secondary" onClick={() => setOpenId(openId === a.id ? '' : a.id)} aria-expanded={openId === a.id}>
                      {openId === a.id ? 'Hide sessions' : 'Sessions'}
                    </Button>
                    <Button as={Link} size="sm" variant="secondary" to={`/integrity?assessmentId=${a.id}`}>Cases</Button>
                    <Button as={Link} size="sm" variant="secondary" to={`/assessments/manage/${a.id}`}>Edit</Button>
                  </div>
                </div>
                {openId === a.id && <div className="mb-3 rounded-2xl bg-sand/60"><SessionsPanel assessmentId={a.id} /></div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  );
};

export default AssessmentManage;
