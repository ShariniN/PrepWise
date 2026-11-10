import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import { Badge, Card, EmptyState, Input, Select, Skeleton } from '../../components/ui';
import { listQuestions } from './api';
import { errorMessage } from '../../lib/apiClient';
import { QUESTION_TYPES as TYPES, DIFFICULTIES as DIFFS } from './utils';

const DIFF_TONE = { easy: 'success', medium: 'warning', hard: 'danger' };

const PracticeList = () => {
  const [filters, setFilters] = useState({ topic: '', difficulty: '', type: '', unseen: false });
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, topic: topic.trim() })), 300);
    return () => clearTimeout(t);
  }, [topic]);

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (filters.topic) params.topic = filters.topic;
    if (filters.difficulty) params.difficulty = filters.difficulty;
    if (filters.type) params.type = filters.type;
    if (filters.unseen) params.unseen = 1;
    (async () => {
      try {
        const data = await listQuestions(params);
        let list = data.questions || [];
        if (!filters.unseen) {
          // The API has no solved flag; questions missing from the "unseen" list were solved.
          try {
            const unseen = await listQuestions({ ...params, unseen: 1 });
            const open = new Set((unseen.questions || []).map((q) => q.id));
            list = list.map((q) => ({ ...q, solved: !open.has(q.id) }));
          } catch { /* badges are optional */ }
        }
        if (!cancelled) { setQuestions(list); setError(''); }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e, 'Could not load questions')); setQuestions([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [filters, tick]);

  const reload = () => { setQuestions(null); setTick((n) => n + 1); };
  const set = (patch) => { setQuestions(null); setFilters((f) => ({ ...f, ...patch })); };

  return (
    <AppShell width="narrow" title="Practice" subtitle="Pick a question, write your answer and get instant feedback.">
      <div className="space-y-5">
        <Card className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <div>
            <label htmlFor="pl-topic" className="mb-1.5 block text-sm font-medium text-ink">Topic</label>
            <Input id="pl-topic" value={topic} onChange={(e) => { setQuestions(null); setTopic(e.target.value); }} placeholder="e.g. arrays" />
          </div>
          <div>
            <label htmlFor="pl-diff" className="mb-1.5 block text-sm font-medium text-ink">Difficulty</label>
            <Select id="pl-diff" value={filters.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
              <option value="">All</option>
              {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="pl-type" className="mb-1.5 block text-sm font-medium text-ink">Type</label>
            <Select id="pl-type" value={filters.type} onChange={(e) => set({ type: e.target.value })}>
              <option value="">All</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={filters.unseen} onChange={(e) => set({ unseen: e.target.checked })} />
            Unseen only
          </label>
        </Card>

        {questions === null && (
          <div role="status" aria-label="Loading questions" className="space-y-3">
            {[0, 1, 2, 3].map((n) => <Skeleton key={n} className="h-16 w-full" rounded="rounded-3xl" />)}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-2xl border border-danger-100 bg-danger-100 p-4 text-sm text-danger-700">
            {error} <button type="button" className="ml-2 font-semibold underline" onClick={reload}>Retry</button>
          </div>
        )}
        {questions && !error && questions.length === 0 && (
          <EmptyState title="No questions match these filters." />
        )}
        {questions && questions.length > 0 && (
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id}>
                <Link to={`/practice/${q.id}`} className="block rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-600/25">
                  <Card lift className="flex flex-wrap items-center gap-2 !py-4">
                    <span className="min-w-[12rem] flex-1 font-display text-lg font-semibold text-ink">{q.title}</span>
                    {q.solved && <Badge tone="success" dot>Solved</Badge>}
                    <Badge tone="primary">{q.type}</Badge>
                    <Badge tone={DIFF_TONE[q.difficulty] || 'neutral'}>{q.difficulty}</Badge>
                    {(q.topic || []).map((t) => <Badge key={t}>{t}</Badge>)}
                    {q.estimatedMinutes ? <span className="text-xs text-ink-muted">{q.estimatedMinutes} min</span> : null}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
};

export default PracticeList;
