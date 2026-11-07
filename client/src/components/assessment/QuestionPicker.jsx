import React, { useEffect, useState } from 'react';
import { Badge, Button, Input, Select, Skeleton } from '../ui';
import { listBank } from '../../api/questions';
import { errorMessage } from '../../api/client';
import { QUESTION_TYPES } from '../../utils/practice';

const VariantChip = ({ group }) => (group
  ? <Badge tone="warning" className="" ><span title="Each student gets one published question from this group, chosen consistently per student">variant group: {group}</span></Badge>
  : null);

// Ordered selection of published bank questions. `meta` maps id -> { title, type, variantGroup }.
const QuestionPicker = ({ selected, meta, onChange, onMeta, disabled }) => {
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [bank, setBank] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listBank({ status: 'published', ...(type ? { type } : {}) });
        if (cancelled) return;
        setBank(d.questions || []); setError('');
        onMeta(Object.fromEntries((d.questions || []).map((q) => [q.id, { title: q.title, type: q.type, variantGroup: q.variantGroup || '' }])));
      } catch (e) { if (!cancelled) { setError(errorMessage(e, 'Could not load the question bank')); setBank([]); } }
    })();
    return () => { cancelled = true; };
    // onMeta is stable enough for a one-off merge per filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const move = (i, d) => {
    const next = [...selected];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (id) => onChange(selected.filter((x) => x !== id));
  const add = (id) => { if (!selected.includes(id) && selected.length < 50) onChange([...selected, id]); };

  const shown = (bank || []).filter((q) => !selected.includes(q.id) && (!text.trim() || q.title.toLowerCase().includes(text.trim().toLowerCase())));
  const row = 'flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm text-ink';

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-3xl bg-sand/60 p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">In this assessment ({selected.length}/50)</h3>
        {selected.length === 0 && <p className="text-sm text-ink-2">Pick at least one question. Students may see them in a shuffled order if shuffling is on.</p>}
        <ol className="space-y-2">
          {selected.map((id, i) => {
            const m = meta[id] || { title: id, type: '' };
            return (
              <li key={id} className={row}>
                <span className="w-5 text-ink-2">{i + 1}.</span>
                <span className="min-w-[8rem] flex-1">{m.title}</span>
                {m.type && <Badge tone="primary">{m.type}</Badge>}
                <VariantChip group={m.variantGroup} />
                {!disabled && (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${m.title} up`}>Up</Button>
                    <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === selected.length - 1} aria-label={`Move ${m.title} down`}>Down</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(id)} aria-label={`Remove ${m.title}`}>Remove</Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {!disabled && (
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-ink">Published questions</h3>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search title" aria-label="Search questions" />
            <Select value={type} onChange={(e) => { setBank(null); setType(e.target.value); }} aria-label="Filter by type" className="sm:w-44">
              <option value="">All types</option>
              {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          {bank === null && <div role="status" aria-label="Loading" className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
          {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
          <ul className="max-h-72 space-y-2 overflow-auto">
            {shown.map((q) => (
              <li key={q.id} className={row}>
                <span className="min-w-[8rem] flex-1">{q.title}</span>
                <span className="text-xs text-ink-2">{q.type}, {q.difficulty}</span>
                <VariantChip group={q.variantGroup} />
                <Button size="sm" variant="secondary" onClick={() => add(q.id)}>Add</Button>
              </li>
            ))}
            {bank && shown.length === 0 && <li className="text-sm text-ink-2">No matching published questions.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default QuestionPicker;
