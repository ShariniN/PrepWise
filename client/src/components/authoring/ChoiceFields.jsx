import React from 'react';
import { Button, Field, Input, Textarea } from '../ui';

// Answer key fields for mcq and trace questions.
const ChoiceFields = ({ form, set, disabled }) => {
  if (form.type === 'trace') {
    return (
      <div className="space-y-4">
        <Field label="Expected output (what the program prints)">
          {(p) => <Textarea {...p} className="font-mono" rows={4} disabled={disabled} value={form.traceAnswer} onChange={(e) => set({ traceAnswer: e.target.value })} />}
        </Field>
        <Field label="Explanation (shown after answering)">
          {(p) => <Textarea {...p} rows={3} disabled={disabled} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />}
        </Field>
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
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" className="h-4 w-4 accent-primary-600" disabled={disabled} checked={form.multi} onChange={(e) => set({ multi: e.target.checked, correct: e.target.checked ? form.correct : form.correct.slice(0, 1) })} />
        Allow multiple correct answers
      </label>
      <ul className="space-y-2">
        {form.options.map((o, i) => (
          <li key={i} className="flex items-center gap-3">
            <input type={form.multi ? 'checkbox' : 'radio'} name="correct" aria-label={`Option ${i + 1} is correct`} className="h-4 w-4 shrink-0 accent-primary-600"
              disabled={disabled} checked={form.correct.includes(i)} onChange={() => toggleCorrect(i)} />
            <Input disabled={disabled} value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} />
            <Button size="sm" variant="ghost" className="!text-danger-600 hover:!bg-danger-50" disabled={disabled || form.options.length <= 2} onClick={() => removeOption(i)}>Remove</Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" disabled={disabled || form.options.length >= 8} onClick={() => set({ options: [...form.options, ''] })}>Add option</Button>
      <Field label="Explanation (shown after answering)">
        {(p) => <Textarea {...p} rows={3} disabled={disabled} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />}
      </Field>
    </div>
  );
};

export default ChoiceFields;
