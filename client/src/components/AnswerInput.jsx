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
        <legend className="text-sm text-gray-600 mb-1">{question.multi ? 'Select all that apply' : 'Select one answer'}</legend>
        {(question.options || []).map((opt, i) => (
          <label key={i} className="flex items-start gap-2 border rounded p-2 hover:bg-gray-50 cursor-pointer">
            <input
              type={question.multi ? 'checkbox' : 'radio'}
              name="mcq"
              checked={selected.includes(i)}
              onChange={() => toggle(i)}
              className="mt-1"
            />
            <span className="text-sm text-gray-800 whitespace-pre-wrap">{opt}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  const trace = question.type === 'trace';
  return (
    <div>
      <label className="text-sm text-gray-600" htmlFor="answer-text">
        {trace ? 'What does the program print?' : 'Your answer'}
      </label>
      <textarea
        id="answer-text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        maxLength={8000}
        rows={trace ? 6 : 10}
        className={`w-full mt-1 border border-gray-300 rounded p-2 text-sm ${trace ? 'font-mono' : ''}`}
      />
      {!trace && <p className="text-xs text-gray-500 text-right">{(value || '').length}/8000</p>}
    </div>
  );
};

export default AnswerInput;
