import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, ChevronRight } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Badge, Button, Card, EmptyState, Skeleton, StatusPill } from '../components/ui';
import { listAssessments } from '../api/assessments';
import { errorMessage } from '../api/client';
import { fmtDateTime, fmtDuration } from '../utils/assessment';

const GROUPS = [
  { key: 'open', title: 'Open now' },
  { key: 'scheduled', title: 'Upcoming' },
  { key: 'closed', title: 'Closed' },
];
const TONES = { open: 'success', scheduled: 'primary', closed: 'neutral', draft: 'neutral' };

const Row = ({ a }) => {
  const active = (a.sessions || []).find((s) => s.status === 'active');
  return (
    <li>
      <Link to={`/assessments/${a.id}`} className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl p-4 transition hover:bg-primary-50/60">
        <span className="min-w-[12rem] flex-1 font-semibold text-ink">{a.title}</span>
        {active && <Badge tone="warning" dot>In progress</Badge>}
        <StatusPill tone={TONES[a.status]}>{a.status}</StatusPill>
        <span className="inline-flex items-center gap-1 text-xs text-ink-2"><Clock size={14} aria-hidden="true" />{fmtDuration(a.durationMinutes)}</span>
        <ChevronRight size={18} className="text-ink-muted transition group-hover:translate-x-0.5" aria-hidden="true" />
        <span className="basis-full text-xs text-ink-2">
          {fmtDateTime(a.opensAt)} to {fmtDateTime(a.closesAt)} &middot; {a.questionCount} question{a.questionCount === 1 ? '' : 's'}
        </span>
      </Link>
    </li>
  );
};

const AssessmentList = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listAssessments();
        if (!cancelled) { setItems(d.assessments || []); setError(''); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e, 'Could not load assessments')); setItems([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return (
    <AppShell
      width="narrow"
      eyebrow="Timed work"
      title="Assessments"
      subtitle="Timed assessments set by your lecturers. The timer starts when you press Start and the server keeps the clock."
    >
      <div className="space-y-5">
        {items === null && (
          <Card role="status" aria-label="Loading assessments" className="space-y-3">
            <Skeleton className="h-6 w-1/3" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
          </Card>
        )}
        {error && (
          <Card role="alert" tone="sand" className="flex flex-wrap items-center gap-3 text-sm text-danger-700">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={() => { setItems(null); setTick((n) => n + 1); }}>Retry</Button>
          </Card>
        )}
        {items && !error && items.length === 0 && (
          <EmptyState icon={<ClipboardList size={24} aria-hidden="true" />} title="No assessments yet" description="No assessments have been set for you yet." />
        )}
        {items && GROUPS.map((g) => {
          const list = items.filter((a) => a.status === g.key);
          if (!list.length) return null;
          return (
            <Card key={g.key} className="p-3 sm:p-4">
              <h2 className="px-4 pb-1 pt-2 font-display text-lg font-semibold text-ink">{g.title}</h2>
              <ul className="divide-y divide-line">{list.map((a) => <Row key={a.id} a={a} />)}</ul>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
};

export default AssessmentList;
