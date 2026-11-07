import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, Sparkles } from 'lucide-react';
import AppShell from '../components/AppShell';
import AiDraftDialog from '../components/authoring/AiDraftDialog';
import { Badge, Button, Card, EmptyState, Field, Select, Skeleton } from '../components/ui';
import { listBank, duplicateQuestion } from '../api/questions';
import { errorMessage } from '../api/client';
import { QUESTION_TYPES, STATUSES } from '../utils/practice';

const STATUS_TONE = { draft: 'neutral', in_review: 'primary', published: 'success', retired: 'danger' };

const Row = ({ q, onDuplicate, busy }) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-6">
    <Link to={`/questions/${q.id}`} className="min-w-[12rem] flex-1 font-semibold text-ink hover:text-primary-700 hover:underline">{q.title || '(untitled)'}</Link>
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="primary">{q.type}</Badge>
      <Badge tone="neutral">{q.difficulty}</Badge>
      <Badge tone={STATUS_TONE[q.status] || 'neutral'} dot>{q.status?.replace('_', ' ')}</Badge>
      {q.source === 'ai_drafted' && <Badge tone="warning">AI drafted</Badge>}
      {(q.topic || []).map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
    </div>
    {q.editable
      ? <Button as={Link} to={`/questions/${q.id}`} size="sm" variant="secondary">Edit</Button>
      : <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDuplicate(q)}>Duplicate to edit</Button>}
  </li>
);

const QuestionBank = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', type: '', mine: false });
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.type) params.type = filters.type;
    if (filters.mine) params.mine = 1;
    (async () => {
      try {
        const data = await listBank(params);
        if (!cancelled) { setQuestions(data.questions || []); setError(''); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e, 'Could not load questions')); setQuestions([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [filters, tick]);

  const set = (patch) => { setQuestions(null); setFilters((f) => ({ ...f, ...patch })); };

  const duplicate = async (q) => {
    setBusy(true);
    try {
      const data = await duplicateQuestion(q.id);
      toast.success('Copied to your drafts');
      navigate(`/questions/${data.question.id}`);
    } catch (e) { toast.error(errorMessage(e, 'Could not duplicate')); } finally { setBusy(false); }
  };

  const onAiCreated = (list) => {
    setAi(false);
    if (list.length === 1) navigate(`/questions/${list[0].id}`);
    else { toast.success(`${list.length} drafts created`); set({}); setTick((n) => n + 1); }
  };

  const own = (questions || []).filter((q) => !q.isSeed);
  const seeds = (questions || []).filter((q) => q.isSeed);

  return (
    <AppShell
      title="Question bank"
      actions={(
        <>
          <Button variant="secondary" icon={<Sparkles size={16} aria-hidden="true" />} onClick={() => setAi(true)}>Draft with AI</Button>
          <Button as={Link} to="/questions/new" icon={<Plus size={16} aria-hidden="true" />}>New question</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <Card tone="sand" className="!p-4">
          <div className="grid gap-4 sm:flex sm:flex-wrap sm:items-end">
            <Field label="Status" className="sm:w-48">
              {(p) => (
                <Select {...p} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
                  <option value="">All</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Type" className="sm:w-48">
              {(p) => (
                <Select {...p} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
                  <option value="">All</option>
                  {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              )}
            </Field>
            <label className="flex min-h-[2.75rem] items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={filters.mine} onChange={(e) => set({ mine: e.target.checked })} /> Mine only
            </label>
          </div>
        </Card>

        {questions === null && (
          <div role="status" className="space-y-3">
            <Skeleton className="h-16 w-full" rounded="rounded-3xl" />
            <Skeleton className="h-16 w-full" rounded="rounded-3xl" />
            <span className="sr-only">Loading questions...</span>
          </div>
        )}
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
            {error}
            <Button size="sm" variant="secondary" onClick={() => { setQuestions(null); setTick((n) => n + 1); }}>Retry</Button>
          </div>
        )}
        {questions && !error && (
          <>
            <Card as="section" padded={false} className="overflow-hidden">
              <h2 className="px-4 pb-2 pt-5 font-display text-xl font-semibold text-ink sm:px-6">Your institution</h2>
              {own.length === 0
                ? <div className="px-4 pb-5 sm:px-6"><EmptyState title="No questions yet" description="No questions yet. Create one, draft with AI, or duplicate a seed question below." className="!py-8" /></div>
                : <ul className="divide-y divide-line">{own.map((q) => <Row key={q.id} q={q} onDuplicate={duplicate} busy={busy} />)}</ul>}
            </Card>
            <Card as="section" padded={false} className="overflow-hidden">
              <h2 className="px-4 pb-2 pt-5 font-display text-xl font-semibold text-ink sm:px-6">Global seed bank <span className="font-sans text-sm font-normal text-ink-2">(read only)</span></h2>
              {seeds.length === 0
                ? <p className="px-4 pb-5 text-sm text-ink-2 sm:px-6">No seed questions match.</p>
                : <ul className="divide-y divide-line">{seeds.map((q) => <Row key={q.id} q={q} onDuplicate={duplicate} busy={busy} />)}</ul>}
            </Card>
          </>
        )}
      </div>
      {ai && <AiDraftDialog onClose={() => setAi(false)} onCreated={onAiCreated} />}
    </AppShell>
  );
};

export default QuestionBank;
