import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getRubric, saveRubric, deleteRubric } from '../../api/questions';
import { errorMessage } from '../../api/client';
import { Button, Input, Skeleton } from '../ui';

const blank = () => ({ name: '', description: '', maxPoints: 10, levels: [] });
const dangerBtn = '!text-danger-600 hover:!bg-danger-50';

// Rubric for short / behavioural questions (stored separately from the question).
const RubricEditor = ({ questionId, disabled }) => {
  const [criteria, setCriteria] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getRubric(questionId);
        if (cancelled) return;
        setExists(!!data.rubric);
        setCriteria(data.rubric?.criteria?.map((c) => ({ ...blank(), ...c, levels: c.levels || [] })) || [blank()]);
      } catch (e) {
        if (!cancelled) { toast.error(errorMessage(e, 'Could not load rubric')); setCriteria([blank()]); }
      }
    })();
    return () => { cancelled = true; };
  }, [questionId]);

  if (!criteria) return <div role="status"><Skeleton className="h-24 w-full" rounded="rounded-2xl" /><span className="sr-only">Loading rubric...</span></div>;

  const patch = (i, p) => setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const patchLevel = (i, k, p) => patch(i, { levels: criteria[i].levels.map((l, j) => (j === k ? { ...l, ...p } : l)) });

  const save = async () => {
    const clean = criteria.filter((c) => c.name.trim()).map((c) => ({
      name: c.name.trim(),
      description: c.description,
      maxPoints: Number(c.maxPoints),
      levels: c.levels.filter((l) => l.label.trim()).map((l) => ({ label: l.label.trim(), points: Number(l.points), description: l.description || '' })),
    }));
    if (clean.length === 0) { toast.error('Add at least one named criterion'); return; }
    setBusy(true);
    try { await saveRubric(questionId, clean); setExists(true); toast.success('Rubric saved'); }
    catch (e) { toast.error(errorMessage(e, 'Could not save rubric')); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await deleteRubric(questionId); setExists(false); setCriteria([blank()]); toast.success('Rubric removed'); }
    catch (e) { toast.error(errorMessage(e, 'Could not remove rubric')); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-ink">Rubric <span className="font-sans text-sm font-normal text-ink-2">(1-20 criteria; saved separately from the question)</span></h3>
      {criteria.map((c, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-line bg-paper p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto] sm:items-center">
            <Input disabled={disabled} placeholder="Criterion name" value={c.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Criterion name" />
            <Input type="number" min="0" max="100" disabled={disabled} value={c.maxPoints} onChange={(e) => patch(i, { maxPoints: e.target.value })} aria-label="Max points" />
            <Button size="sm" variant="ghost" className={dangerBtn} disabled={disabled} onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>Remove</Button>
          </div>
          <Input disabled={disabled} placeholder="Description (optional)" value={c.description} onChange={(e) => patch(i, { description: e.target.value })} aria-label="Criterion description" />
          {c.levels.map((l, k) => (
            <div key={k} className="grid gap-2 sm:grid-cols-[8rem_5rem_1fr_auto] sm:items-center sm:pl-4">
              <Input disabled={disabled} placeholder="Level" value={l.label} onChange={(e) => patchLevel(i, k, { label: e.target.value })} aria-label="Level label" />
              <Input type="number" disabled={disabled} value={l.points} onChange={(e) => patchLevel(i, k, { points: e.target.value })} aria-label="Level points" />
              <Input disabled={disabled} placeholder="What this level looks like" value={l.description} onChange={(e) => patchLevel(i, k, { description: e.target.value })} aria-label="Level description" />
              <Button size="sm" variant="ghost" className={dangerBtn} disabled={disabled} aria-label="Remove level" onClick={() => patch(i, { levels: c.levels.filter((_, j) => j !== k) })}>x</Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => patch(i, { levels: [...c.levels, { label: '', points: 0, description: '' }] })}>Add level</Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={disabled || criteria.length >= 20} onClick={() => setCriteria([...criteria, blank()])}>Add criterion</Button>
        <Button size="sm" disabled={disabled} loading={busy} onClick={save}>Save rubric</Button>
        {exists && <Button size="sm" variant="secondary" className="!border-danger-200 !text-danger-700" disabled={disabled || busy} onClick={remove}>Delete rubric</Button>}
      </div>
    </div>
  );
};

export default RubricEditor;
