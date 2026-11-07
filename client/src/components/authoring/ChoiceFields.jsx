import React from 'react';

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white disabled:bg-gray-100';

// Answer key fields for mcq and trace questions.
const ChoiceFields = ({ form, set, disabled }) => {
  if (form.type === 'trace') {
    return (
      <div className="space-y-3">
        <label className="block text-xs text-gray-600">Expected output (what the program prints)
          <textarea className={`${inp} font-mono`} rows={4} disabled={disabled} value={form.traceAnswer} onChange={(e) => set({ traceAnswer: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-600">Explanation (shown after answering)
          <textarea className={inp} rows={3} disabled={disabled} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />
        </label>
      </div>
    );
  }
  const setOption = (i, v) => set({ options: form.options.map((o, j) => (j === i ? v : o)) });
  const removeOption = (i) => set({
    options: form.options.filter((_, j) => j !== i),
    correct: form.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
  });
  const toggleCorrect = (i) => {
    if (form.multi) set({ correct: form.correct.includes(i) ? form.correct.filter((c) => c !== i) : [...form.correct, i].sort((a, b) => a - b) });
    else set({ correct: [i] });
  };
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={disabled} checked={form.multi} onChange={(e) => set({ multi: e.target.checked, correct: e.target.checked ? form.correct : form.correct.slice(0, 1) })} />
        Allow multiple correct answers
      </label>
      <ul className="space-y-2">
        {form.options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <input type={form.multi ? 'checkbox' : 'radio'} name="correct" aria-label={`Option ${i + 1} is correct`}
              disabled={disabled} checked={form.correct.includes(i)} onChange={() => toggleCorrect(i)} />
            <input className={inp} disabled={disabled} value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
            <button type="button" disabled={disabled || form.options.length <= 2} onClick={() => removeOption(i)} className="text-xs text-red-600 disabled:opacity-40">Remove</button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={disabled || form.options.length >= 8} onClick={() => set({ options: [...form.options, ''] })} className="text-xs px-2 py-1 rounded bg-gray-200 disabled:opacity-50">Add option</button>
      <label className="block text-xs text-gray-600">Explanation (shown after answering)
        <textarea className={inp} rows={3} disabled={disabled} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />
      </label>
    </div>
  );
};

export default ChoiceFields;
