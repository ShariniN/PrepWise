import React from 'react';

// Answer controls for non-code question types.
// value: mcq -> array of selected indexes, others -> string.
const AnswerInput = ({ question, value, onChange }) => {
  if (question.type === 'mcq') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (i) => {
      if (question.multi) onChange(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort((a, b) => a - b));
      else onChange([i]);
    };
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink mb-1">{question.multi ? 'Select all that apply' : 'Select one answer'}</legend>
        {(question.options || []).map((opt, i) => (
          <label key={i} className="flex items-start gap-3 border border-line rounded-2xl p-3 hover:border-primary-300 hover:bg-primary-50 cursor-pointer transition">
            <input
              type={question.multi ? 'checkbox' : 'radio'}
              name="mcq"
              checked={selected.includes(i)}
              onChange={() => toggle(i)}
              className="mt-1 accent-primary-600"
            />
            <span className="text-sm text-ink whitespace-pre-wrap">{opt}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  const trace = question.type === 'trace';
  return (
    <div>
      <label className="text-sm font-medium text-ink" htmlFor="answer-text">
        {trace ? 'What does the program print?' : 'Your answer'}
      </label>
      <textarea
        id="answer-text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        maxLength={8000}
        rows={trace ? 6 : 10}
        className={`w-full mt-1.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15 ${trace ? 'font-mono' : ''}`}
      />
      {!trace && <p className="text-xs text-ink-muted text-right">{(value || '').length}/8000</p>}
    </div>
  );
};

export default AnswerInput;
