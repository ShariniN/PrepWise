import React, { useEffect, useState } from 'react';
import { listBank } from '../../api/questions';
import { errorMessage } from '../../api/client';
import { QUESTION_TYPES } from '../../utils/practice';

const VariantChip = ({ group }) => (group
  ? <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5" title="Each student gets one published question from this group, chosen consistently per student">
      variant group: {group}
    </span>
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
  const btn = 'text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40';

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">In this assessment ({selected.length}/50)</h3>
        {selected.length === 0 && <p className="text-sm text-gray-500">Pick at least one question. Students may see them in a shuffled order if shuffling is on.</p>}
        <ol className="space-y-1">
          {selected.map((id, i) => {
            const m = meta[id] || { title: id, type: '' };
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 border rounded p-2 text-sm">
                <span className="w-5 text-gray-500">{i + 1}.</span>
                <span className="flex-1 min-w-[8rem]">{m.title}</span>
                {m.type && <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">{m.type}</span>}
                <VariantChip group={m.variantGroup} />
                {!disabled && (
                  <span className="flex gap-1">
                    <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${m.title} up`}>Up</button>
                    <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === selected.length - 1} aria-label={`Move ${m.title} down`}>Down</button>
                    <button type="button" className={btn} onClick={() => remove(id)} aria-label={`Remove ${m.title}`}>Remove</button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {!disabled && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Published questions</h3>
          <div className="flex gap-2 mb-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search title" className="border border-gray-300 rounded px-2 py-1 text-sm flex-1" aria-label="Search questions" />
            <select value={type} onChange={(e) => { setBank(null); setType(e.target.value); }} className="border border-gray-300 rounded px-2 py-1 text-sm" aria-label="Filter by type">
              <option value="">All types</option>
              {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {bank === null && <p className="text-sm text-gray-500" role="status">Loading...</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <ul className="max-h-72 overflow-auto space-y-1">
            {shown.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2 border rounded p-2 text-sm">
                <span className="flex-1 min-w-[8rem]">{q.title}</span>
                <span className="text-xs text-gray-500">{q.type}, {q.difficulty}</span>
                <VariantChip group={q.variantGroup} />
                <button type="button" className={btn} onClick={() => add(q.id)}>Add</button>
              </li>
            ))}
            {bank && shown.length === 0 && <li className="text-sm text-gray-500">No matching published questions.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default QuestionPicker;
