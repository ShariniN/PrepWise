import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getRubric, saveRubric, deleteRubric } from '../../api/questions';
import { errorMessage } from '../../api/client';

const inp = 'w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white disabled:bg-gray-100';
const blank = () => ({ name: '', description: '', maxPoints: 10, levels: [] });

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

  if (!criteria) return <p className="text-sm text-gray-500">Loading rubric...</p>;

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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Rubric <span className="font-normal text-xs text-gray-500">(1-20 criteria; saved separately from the question)</span></h3>
      {criteria.map((c, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
            <input className={inp} disabled={disabled} placeholder="Criterion name" value={c.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Criterion name" />
            <input type="number" min="0" max="100" className={inp} disabled={disabled} value={c.maxPoints} onChange={(e) => patch(i, { maxPoints: e.target.value })} aria-label="Max points" />
            <button type="button" disabled={disabled} className="text-xs text-red-600" onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <input className={inp} disabled={disabled} placeholder="Description (optional)" value={c.description} onChange={(e) => patch(i, { description: e.target.value })} />
          {c.levels.map((l, k) => (
            <div key={k} className="grid gap-2 sm:grid-cols-[8rem_5rem_1fr_auto] pl-4">
              <input className={inp} disabled={disabled} placeholder="Level" value={l.label} onChange={(e) => patchLevel(i, k, { label: e.target.value })} />
              <input type="number" className={inp} disabled={disabled} value={l.points} onChange={(e) => patchLevel(i, k, { points: e.target.value })} />
              <input className={inp} disabled={disabled} placeholder="What this level looks like" value={l.description} onChange={(e) => patchLevel(i, k, { description: e.target.value })} />
              <button type="button" disabled={disabled} className="text-xs text-red-600" onClick={() => patch(i, { levels: c.levels.filter((_, j) => j !== k) })}>x</button>
            </div>
          ))}
          <button type="button" disabled={disabled} className="text-xs underline text-indigo-700" onClick={() => patch(i, { levels: [...c.levels, { label: '', points: 0, description: '' }] })}>Add level</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || criteria.length >= 20} className="text-xs px-2 py-1 rounded bg-gray-200 disabled:opacity-50" onClick={() => setCriteria([...criteria, blank()])}>Add criterion</button>
        <button type="button" disabled={disabled || busy} className="text-xs px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50" onClick={save}>Save rubric</button>
        {exists && <button type="button" disabled={disabled || busy} className="text-xs px-3 py-1 rounded bg-white border border-red-300 text-red-700" onClick={remove}>Delete rubric</button>}
      </div>
    </div>
  );
};

export default RubricEditor;
